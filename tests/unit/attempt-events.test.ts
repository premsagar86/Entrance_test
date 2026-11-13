import { describe, expect, it } from "vitest";
import { eventSchema, summarizeEvents } from "../../src/lib/attempt-events";

describe("attempt events", () => {
  it("accepts known event types only", () => {
    expect(eventSchema.safeParse({ type: "TAB_HIDDEN" }).success).toBe(true);
    expect(eventSchema.safeParse({ type: "HACK" }).success).toBe(false);
  });
  it("rejects unknown keys", () => {
    expect(eventSchema.safeParse({ type: "WINDOW_BLUR", extra: 1 }).success).toBe(false);
  });
  it("summarizes counts", () => {
    expect(summarizeEvents(["TAB_HIDDEN", "TAB_VISIBLE", "TAB_HIDDEN", "WINDOW_BLUR"])).toEqual({ tabSwitches: 2, blurs: 1, total: 4 });
    expect(summarizeEvents([])).toEqual({ tabSwitches: 0, blurs: 0, total: 0 });
  });
});
