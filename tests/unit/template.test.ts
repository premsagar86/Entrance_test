import { describe, expect, it } from "vitest";
import { parseTemplate } from "@/lib/parsers/template";

describe("parseTemplate", () => {
  it("parses questions, options, answer and explanation", () => {
    const qs = parseTemplate(`
1. What is 2 + 2?
A) 3
B) 4
C) 5
D) 6
Answer: B
Explanation: Basic addition.

Q2) Capital of France?
a. Berlin
b. Paris
c. Rome
Correct Answer: B
`);
    expect(qs).toHaveLength(2);
    expect(qs[0]).toMatchObject({ text: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctOption: 1, explanation: "Basic addition." });
    expect(qs[1]).toMatchObject({ options: ["Berlin", "Paris", "Rome"], correctOption: 1 });
  });

  it("leaves the key null when missing, with lower confidence", () => {
    const [q] = parseTemplate("1. Pick one\nA) x\nB) y");
    expect(q.correctOption).toBeNull();
    expect(q.confidence).toBeLessThan(0.9);
  });

  it("ignores an answer letter outside the option range", () => {
    const [q] = parseTemplate("1. Pick\nA) x\nB) y\nAnswer: E");
    expect(q.correctOption).toBeNull();
  });

  it("joins wrapped lines", () => {
    const [q] = parseTemplate("1. A very long\nquestion text?\nA) first\nline two\nB) second\nAnswer: A");
    expect(q.text).toBe("A very long question text?");
    expect(q.options[0]).toBe("first line two");
  });

  it("keeps an unparseable question flagged instead of dropping it", () => {
    const [q] = parseTemplate("1. Question with no options at all");
    expect(q.confidence).toBeLessThan(0.5);
  });

  it("returns nothing for prose", () => {
    expect(parseTemplate("Just some paragraph of text.\nAnother line.")).toEqual([]);
  });
});
