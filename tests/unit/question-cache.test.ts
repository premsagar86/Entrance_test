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

import { getStartQuestions } from "@/lib/question-cache";
import { clearMemLimits, memHit } from "@/lib/mem-limit";

describe("getStartQuestions", () => {
  beforeEach(() => clearOptionCountsCache());

  it("serves the question payload from memory within the TTL", async () => {
    const load = vi.fn(async () => [{ id: "q1", text: "2+2?", options: ["3", "4"], marks: 1 }]);
    const a = await getStartQuestions("t1", load, 1_000);
    const b = await getStartQuestions("t1", load, 30_000);
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    await getStartQuestions("t1", load, 70_000);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("memHit", () => {
  beforeEach(() => clearMemLimits());

  it("allows up to the limit, then blocks, then resets after the window", () => {
    expect([1, 2, 3].map(() => memHit("k", 3, 1_000, 0))).toEqual([true, true, true]);
    expect(memHit("k", 3, 1_000, 10)).toBe(false);
    expect(memHit("k", 3, 1_000, 1_500)).toBe(true);
  });

  it("counts keys separately", () => {
    expect(memHit("a", 1, 1_000, 0)).toBe(true);
    expect(memHit("b", 1, 1_000, 0)).toBe(true);
    expect(memHit("a", 1, 1_000, 5)).toBe(false);
  });
});
