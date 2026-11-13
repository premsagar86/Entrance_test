import { describe, expect, it } from "vitest";
import { parseAnswerKey, planAnswerKey } from "@/lib/answer-key";

const keys = (t: string) => parseAnswerKey(t).entries.map((e) => `${e.n}${String.fromCharCode(65 + e.option)}`).join(" ");

describe("parseAnswerKey", () => {
  it("reads comma separated pairs", () => {
    expect(keys("1-B, 2-D, 3-A")).toBe("1B 2D 3A");
  });
  it("reads one per line in several styles", () => {
    expect(keys("1. b\n2) C\n(3) (d)\nQ4: a\nQuestion 5 = B\n6,C\n7B")).toBe("1B 2C 3D 4A 5B 6C 7B");
  });
  it("ignores headings and prose", () => {
    expect(keys("Answer Key\n12 Apples are red\n1-A\n2-C\nTotal: 2")).toBe("1A 2C");
  });
  it("does not read a year as a question number", () => {
    expect(keys("In 2024 A test. 1-B")).toBe("1B");
  });
  it("keeps the first of duplicates and reports them", () => {
    const r = parseAnswerKey("1-A, 1-B, 2-C");
    expect(r.entries.map((e) => e.option)).toEqual([0, 2]);
    expect(r.duplicates).toEqual([1]);
  });
  it("treats a bare run of letters as sequential answers", () => {
    expect(keys("B D A C")).toBe("1B 2D 3A 4C");
    expect(keys("BDAC")).toBe("1B 2D 3A 4C");
  });
  it("returns nothing for unrelated text", () => {
    expect(parseAnswerKey("hello world").entries).toEqual([]);
  });
});

describe("planAnswerKey", () => {
  const qs = [
    { options: ["a", "b", "c", "d"], correctOption: null },
    { options: ["a", "b"], correctOption: 1 },
    { options: ["a", "b", "c"], correctOption: 0 },
  ];
  it("maps valid answers and flags the rest", () => {
    const plan = planAnswerKey(
      [
        { n: 1, option: 2 }, // ok
        { n: 2, option: 3 }, // only 2 options
        { n: 9, option: 0 }, // no such question
      ],
      qs,
    );
    expect(plan.assign).toEqual([{ n: 1, option: 2, replaces: null }]);
    expect(plan.invalidOption).toEqual([{ n: 2, option: 3, optionCount: 2 }]);
    expect(plan.unknownQuestion).toEqual([9]);
    expect(plan.missing).toEqual([2, 3]);
  });
  it("reports which existing keys would be replaced", () => {
    const plan = planAnswerKey([{ n: 3, option: 2 }, { n: 2, option: 1 }], qs);
    expect(plan.assign).toEqual([
      { n: 3, option: 2, replaces: 0 },
      { n: 2, option: 1, replaces: null },
    ]);
  });
});
