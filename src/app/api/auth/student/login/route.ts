import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { handleError } from "@/lib/auth";
import { clientIp, parseJson } from "@/lib/http";
import { hit, reset } from "@/lib/rate-limit";
import { hashDob, normalizeDob, safeEqual } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.strictObject({ email: z.email().max(254), dob: z.string().max(10), turnstile: z.string().max(2048).optional() }),
  z.strictObject({ email: z.email().max(254), rollNo: z.string().min(1).max(40), turnstile: z.string().max(2048).optional() }),
]);

const FAIL = () => NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
const WINDOW = 15 * 60_000;

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const body = await parseJson(req, schema);
    const email = body.email.trim().toLowerCase();

    const byIp = await hit(`stu:ip:${ip}`, { limit: 30, windowMs: WINDOW });
    const byEmail = await hit(`stu:email:${email}`, { limit: 5, windowMs: WINDOW, lockMs: WINDOW });
    if (!byIp.allowed || !byEmail.allowed) {
      const wait = Math.max(byIp.retryAfterSec, byEmail.retryAfterSec);
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }

    if (!(await verifyTurnstile(body.turnstile, ip))) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const student = await db.student.findUnique({ where: { email } });
    const pepper = env().DOB_PEPPER;
    let ok = false;

    if ("dob" in body) {
      const dob = normalizeDob(body.dob);
      // Always compute a hash so timing does not reveal whether the email exists.
      const candidate = hashDob(dob ?? "invalid", pepper);
      ok = !!student && !!dob && safeEqual(candidate, student.dobHash);
    } else {
      const stored = student?.rollNo ?? "\u0000none";
      ok = !!student && !!student.rollNo && safeEqual(body.rollNo.trim().toLowerCase(), stored.toLowerCase());
    }

    if (!ok || !student) {
      await audit("anonymous", "student.login.failed");
      return FAIL();
    }

    await reset(`stu:email:${email}`);
    await createSession("STUDENT", student.id);
    await audit(`student:${student.id}`, "student.login.ok");
    return NextResponse.json({ ok: true, name: student.name });
  } catch (e) {
    return handleError(e);
  }
}
