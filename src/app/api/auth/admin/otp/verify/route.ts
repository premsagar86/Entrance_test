import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError } from "@/lib/auth";
import { clientIp, parseJson } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { otpHash } from "@/lib/otp";

export const dynamic = "force-dynamic";

const schema = z.strictObject({ email: z.email().max(254), otp: z.string().regex(/^\d{6}$/) });
const FAIL = () => NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const body = await parseJson(req, schema);
    const email = body.email.trim().toLowerCase();

    const lim = await hit(`adm:otpverify:ip:${ip}`, { limit: 20, windowMs: 15 * 60_000 });
    if (!lim.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const admin = await db.admin.findUnique({ where: { email } });
    if (!admin) return FAIL();

    const otp = await db.otpCode.findFirst({
      where: { adminId: admin.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.attempts >= 5) return FAIL();

    // Count the attempt first so parallel guesses cannot exceed the cap.
    const bumped = await db.otpCode.updateMany({
      where: { id: otp.id, usedAt: null, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count !== 1) return FAIL();

    if (!safeEqual(otp.codeHash, otpHash(admin.id, body.otp))) {
      await audit(`admin:${admin.id}`, "admin.login.failed");
      return FAIL();
    }

    const used = await db.otpCode.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) return FAIL();

    await createSession("ADMIN", admin.id);
    await audit(`admin:${admin.id}`, "admin.login.ok");
    return NextResponse.json({ ok: true, name: admin.name });
  } catch (e) {
    return handleError(e);
  }
}
