/**
 * Cheap per-server-instance fixed-window limiter (no database). Used for high-frequency student calls
 * (autosave, integrity events) where a database write per request would be the main load. It is a
 * guard against a runaway client, not an exact global limit: each serverless instance keeps its own counts.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function memHit(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  if (buckets.size > 10_000) {
    buckets.forEach((b, k) => {
      if (b.resetAt <= now) buckets.delete(k);
    });
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function clearMemLimits() {
  buckets.clear();
}
