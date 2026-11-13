import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError } from "@/lib/auth";
import { clientIp, parseJson } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { safeEqual } from "@/lib/crypto";
import { verifyTurnstile } from "@/lib/turnstile";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const schema = z.strictObject({
  email: z.email().max(254),
  phone: z.string().max(25).refine((p) => normalizePhone(p) !== null, "Invalid phone"),
  turnstile: z.string().max(2048).optional(),
});

const FAIL = () => NextResponse.json({ error: "Invalid email or phone number" }, { status: 401 });

/** Admin sign-in with email + phone number (the phone number acts as the password). */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const body = await parseJson(req, schema);
    const email = body.email.trim().toLowerCase();

    const a = await hit(`adm:login:ip:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
    const b = await hit(`adm:login:email:${email}`, { limit: 5, windowMs: 10 * 60_000, lockMs: 10 * 60_000 });
    if (!a.allowed || !b.allowed) {
      return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
    }
    if (!(await verifyTurnstile(body.turnstile, ip))) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { email } });
    // Always run the comparison so a missing admin takes the same path as a wrong phone.
    const stored = (admin ? normalizePhone(admin.phone) : null) ?? "0".repeat(15);
    const given = normalizePhone(body.phone) ?? "";
    const phoneOk = safeEqual(stored, given);

    if (!admin || !phoneOk) {
      await audit(admin ? `admin:${admin.id}` : "anonymous", "admin.login.failed");
      return FAIL();
    }

    await createSession("ADMIN", admin.id);
    await audit(`admin:${admin.id}`, "admin.login.ok");
    return NextResponse.json({ ok: true, name: admin.name });
  } catch (e) {
    return handleError(e);
  }
}
