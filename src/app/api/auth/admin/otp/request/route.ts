import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError } from "@/lib/auth";
import { clientIp, parseJson } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { otpHash } from "@/lib/otp";
import { sendMail } from "@/lib/mail";
import { verifyTurnstile } from "@/lib/turnstile";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const RESEND_AFTER_SEC = 30;

const schema = z.strictObject({
  email: z.email().max(254),
  phone: z.string().max(25).refine((p) => normalizePhone(p) !== null, "Invalid phone"),
  turnstile: z.string().max(2048).optional(),
});

/** a***@gmail.com : built from what the caller typed, so it reveals nothing about real admins. */
function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.charAt(0)}${"*".repeat(Math.min(Math.max(user.length - 1, 2), 6))}@${domain}`;
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const body = await parseJson(req, schema);
    const email = body.email.trim().toLowerCase();

    const a = await hit(`adm:otpreq:ip:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
    const b = await hit(`adm:otpreq:email:${email}`, { limit: 5, windowMs: 10 * 60_000, lockMs: 10 * 60_000 });
    if (!a.allowed || !b.allowed) {
      return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
    }
    if (!(await verifyTurnstile(body.turnstile, ip))) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    // Production responses are identical whether or not the admin exists or the email was accepted.
    // Outside production we additionally report the delivery result to make setup debuggable.
    let delivery: "sent" | "console" | "failed" | "throttled" | "no-match" = "no-match";

    const admin = await db.admin.findUnique({ where: { id: undefined, email } });
    const phoneMatches = !!admin && normalizePhone(admin.phone) === normalizePhone(body.phone);

    // Development convenience: skip the emailed code. Requires BOTH a non-production build AND an explicit
    // opt-in flag, so a production deployment can never take this path. Email and phone must still match.
    const devSkipOtp = process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_ADMIN_OTP === "true";
    if (devSkipOtp && admin && phoneMatches) {
      await createSession("ADMIN", admin.id);
      await audit(`admin:${admin.id}`, "admin.login.ok", { method: "dev-skip-otp" });
      console.warn("[auth] DEV_SKIP_ADMIN_OTP is on: signed in without an OTP. This never works in production.");
      return NextResponse.json({ ok: true, signedIn: true, maskedEmail: maskEmail(email), resendAfterSec: RESEND_AFTER_SEC });
    }

    if (admin && phoneMatches) {
      const recent = await db.otpCode.findFirst({
        where: { adminId: admin.id, createdAt: { gt: new Date(Date.now() - RESEND_AFTER_SEC * 1000) } },
        select: { id: true },
      });
      if (recent) {
        delivery = "throttled";
      } else {
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        await db.otpCode.updateMany({ where: { adminId: admin.id, usedAt: null }, data: { usedAt: new Date() } });
        await db.otpCode.create({
          data: { adminId: admin.id, codeHash: otpHash(admin.id, code), expiresAt: new Date(Date.now() + 5 * 60_000) },
        });
        try {
          const r = await sendMail(admin.email, "Your admin login code", `Your login code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.`);
          delivery = r.provider === "console" ? "console" : "sent";
          await audit(`admin:${admin.id}`, "admin.otp.sent", { provider: r.provider, messageId: r.messageId ?? null });
        } catch (err) {
          delivery = "failed";
          console.error("[otp] email delivery failed:", err instanceof Error ? err.message : err);
          await audit(`admin:${admin.id}`, "admin.otp.send_failed");
        }
      }
    } else {
      await audit("anonymous", "admin.otp.rejected");
    }

    return NextResponse.json({
      ok: true,
      message: "If the details match, a login code was sent.",
      maskedEmail: maskEmail(email),
      resendAfterSec: RESEND_AFTER_SEC,
      ...(process.env.NODE_ENV !== "production" ? { delivery } : {}),
    });
  } catch (e) {
    return handleError(e);
  }
}
