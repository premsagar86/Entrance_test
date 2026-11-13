import { PrismaClient } from "@prisma/client";

/**
 * Finalizes attempts that are still IN_PROGRESS well past their deadline (student closed the tab and
 * never came back), scoring whatever was saved. Safe to run repeatedly. Run daily from cron.
 */
const db = new PrismaClient();
const STALE_AFTER_MS = 10 * 60_000;

async function main() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await db.attempt.findMany({ where: { status: "IN_PROGRESS", expiresAt: { lt: cutoff } }, select: { id: true } });
  const { finalizeAttempt } = await import("../src/lib/attempts");
  for (const a of stale) await finalizeAttempt(a.id, "EXPIRED");
  // Housekeeping: expired sessions, OTPs and rate-limit rows.
  const now = new Date();
  const s = await db.session.deleteMany({ where: { absoluteExpiresAt: { lt: now } } });
  const o = await db.otpCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 24 * 3600_000) }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] } });
  console.log(`cleanup: expired ${stale.length} attempts, removed ${s.count} sessions, ${o.count} otps, ${r.count} rate-limit rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
