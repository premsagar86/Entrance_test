import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { clearOptionCountsCache, getOptionCounts } from "@/lib/question-cache";

describe("getOptionCounts", () => {
  beforeEach(() => clearOptionCountsCache());

  it("loads once and serves repeated calls from memory", async () => {
    const load = vi.fn(async () => new Map([["q1", 4]]));
    const a = await getOptionCounts("t1", load, 1_000);
    const b = await getOptionCounts("t1", load, 20_000);
    expect(a.get("q1")).toBe(4);
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL", async () => {
    const load = vi.fn(async () => new Map([["q1", 4]]));
    await getOptionCounts("t1", load, 1_000);
    await getOptionCounts("t1", load, 1_000 + 61_000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps tests separate", async () => {
    const load = vi.fn(async (id: string) => new Map([[`${id}-q`, id === "t1" ? 3 : 5]]));
    const a = await getOptionCounts("t1", load, 1_000);
    const b = await getOptionCounts("t2", load, 1_000);
    expect(a.get("t1-q")).toBe(3);
    expect(b.get("t2-q")).toBe(5);
  });
});
