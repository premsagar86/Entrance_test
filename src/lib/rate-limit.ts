import { db } from "./db";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Lock the key for this long once the limit is exceeded (defaults to the window). */
  lockMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Atomic fixed-window counter in Postgres. One statement, so concurrent
 * requests cannot under-count.
 */
export async function hit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowSec = opts.windowMs / 1000;
  const lockSec = (opts.lockMs ?? opts.windowMs) / 1000;
  const rows = await db.$queryRaw<{ count: number; locked_until: Date | null }[]>`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.locked_until IS NOT NULL AND rate_limits.locked_until > now() THEN rate_limits.count
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1
        ELSE rate_limits.count + 1 END,
      window_start = CASE
        WHEN rate_limits.locked_until IS NOT NULL AND rate_limits.locked_until > now() THEN rate_limits.window_start
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now()
        ELSE rate_limits.window_start END,
      locked_until = CASE
        WHEN rate_limits.locked_until IS NOT NULL AND rate_limits.locked_until > now() THEN rate_limits.locked_until
        WHEN rate_limits.window_start >= now() - make_interval(secs => ${windowSec})
             AND rate_limits.count + 1 > ${opts.limit}
          THEN now() + make_interval(secs => ${lockSec})
        ELSE NULL END
    RETURNING count, locked_until`;
  const row = rows[0];
  if (row.locked_until && row.locked_until.getTime() > Date.now()) {
    return { allowed: false, retryAfterSec: Math.ceil((row.locked_until.getTime() - Date.now()) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export async function reset(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}
