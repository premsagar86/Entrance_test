import { describe, expect, it } from "vitest";
import { scoreAttempt } from "@/lib/scoring";

const qs = [
  { id: "a", correctOption: 1, marks: 2 },
  { id: "b", correctOption: 0, marks: 1 },
  { id: "c", correctOption: 2, marks: 1 },
];

describe("scoreAttempt", () => {
  it("scores correct, wrong and blank answers", () => {
    const r = scoreAttempt(qs, new Map([["a", 1], ["b", 3]]));
    expect(r).toMatchObject({ score: 2, totalMarks: 4, correct: 1, wrong: 1, unanswered: 1 });
    expect(r.outcomes.get("a")).toBe(true);
    expect(r.outcomes.get("b")).toBe(false);
    expect(r.outcomes.get("c")).toBeNull();
  });
  it("treats explicit null as unanswered", () => {
    expect(scoreAttempt(qs, new Map([["a", null]])).unanswered).toBe(3);
  });
  it("applies negative marking per question marks", () => {
    const r = scoreAttempt(qs, new Map([["a", 1], ["b", 2], ["c", 0]]), 0.25);
    expect(r.score).toBe(2 - 0.25 - 0.25);
  });
  it("never goes below zero", () => {
    expect(scoreAttempt(qs, new Map([["a", 0], ["b", 1], ["c", 0]]), 1).score).toBe(0);
  });
  it("never awards marks when the key is missing", () => {
    const r = scoreAttempt([{ id: "x", correctOption: null, marks: 5 }], new Map([["x", 0]]));
    expect(r.score).toBe(0);
    expect(r.correct).toBe(0);
  });
  it("handles an empty test", () => {
    expect(scoreAttempt([], new Map()).totalMarks).toBe(0);
  });
});
