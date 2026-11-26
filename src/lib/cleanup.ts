import { db } from "@/lib/db";
import { finalizeAttempt } from "@/lib/attempts";

const STALE_AFTER_MS = 10 * 60_000;

/**
 * Finalizes attempts still IN_PROGRESS well past their deadline (student closed the tab and never
 * came back), scoring whatever was saved, and removes expired sessions, OTPs and rate-limit rows.
 * Safe to run repeatedly. Used by the daily cron route and `npm run cleanup`.
 */
export async function cleanupAttempts() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db.attempt.findMany({ where: { status: "IN_PROGRESS", expiresAt: { lt: cutoff } }, select: { id: true } });
  // One attempt that cannot be finalized must not block the others or the rest of the cleanup.
  let failed = 0;
  for (const a of stale) {
    try {
      await finalizeAttempt(a.id, "EXPIRED");
    } catch (e) {
      failed++;
      console.error("cleanup: could not finalize attempt", a.id, e);
    }
  }
  const now = new Date();
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const s = await db.session.deleteMany({ where: { absoluteExpiresAt: { lt: now } } });
  const o = await db.otpCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: dayAgo }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] } });
  return { expiredAttempts: stale.length - failed, failed, sessions: s.count, otps: o.count, rateLimits: r.count };
}
