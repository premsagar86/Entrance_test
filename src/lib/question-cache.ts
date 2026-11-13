import { db } from "@/lib/db";

/**
 * Per-test map of questionId -> option count, cached in memory for a short time.
 * Autosave validates every saved answer against the test's questions; without this cache each of the
 * (many) autosave requests would re-read the whole question list from the database.
 * Per server instance, short TTL: a question edit is picked up within a minute.
 */
export type OptionCounts = Map<string, number>;

const TTL_MS = 60_000;
const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; value: OptionCounts }>();

type Loader = (testId: string) => Promise<OptionCounts>;

const loadFromDb: Loader = async (testId) => {
  const questions = await db.question.findMany({ where: { testId }, select: { id: true, options: true } });
  return new Map(questions.map((q) => [q.id, Array.isArray(q.options) ? q.options.length : 0]));
};

export async function getOptionCounts(testId: string, load: Loader = loadFromDb, now: number = Date.now()): Promise<OptionCounts> {
  const hit = cache.get(testId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = await load(testId);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(testId, { at: now, value });
  return value;
}

export function clearOptionCountsCache() {
  cache.clear();
}
