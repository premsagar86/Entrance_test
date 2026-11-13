import { cleanupAttempts } from "../src/lib/cleanup";
import { db } from "../src/lib/db";

/** Run daily (Vercel Cron calls /api/cron/cleanup; this is the manual / VPS-cron equivalent). */
cleanupAttempts()
  .then((r) => console.log(`cleanup: expired ${r.expiredAttempts} attempts, removed ${r.sessions} sessions, ${r.otps} otps, ${r.rateLimits} rate-limit rows`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
