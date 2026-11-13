import { describe, expect, it } from "vitest";
import { filterOf, percent, summarise } from "@/lib/student-summary";

describe("student summary", () => {
  it("maps states to filters", () => {
    expect(filterOf("open")).toBe("available");
    expect(filterOf("expired")).toBe("completed");
    expect(filterOf("closed")).toBe("other");
  });

  it("computes percent safely", () => {
    expect(percent(7, 10)).toBe(70);
    expect(percent(null, 10)).toBeNull();
    expect(percent(5, 0)).toBeNull();
  });

  it("counts states and averages only visible results", () => {
    const s = summarise([
      { state: "open", score: null, totalMarks: 10, resultVisible: false },
      { state: "submitted", score: 8, totalMarks: 10, resultVisible: true },
      { state: "submitted", score: 4, totalMarks: 10, resultVisible: true },
      { state: "submitted", score: 1, totalMarks: 10, resultVisible: false },
    ]);
    expect(s.counts).toMatchObject({ all: 4, available: 1, completed: 3 });
    expect(s.averagePct).toBe(60);
    expect(s.completedRatio).toBe(0.75);
  });
});
