/**
 * Parses a pasted (or extracted-from-a-document) answer key into question-number -> option pairs,
 * and plans how it maps onto a test's questions. Pure functions, shared by the UI preview and the API.
 */

export interface KeyEntry {
  n: number; // 1-based question number
  option: number; // 0-based option index (A = 0)
}

export interface ParsedKey {
  entries: KeyEntry[];
  duplicates: number[]; // question numbers that appeared more than once (the first one is kept)
}

const MAX_Q = 500;

// "1-B", "1.B", "1) B", "(1) (b)", "Q1: b", "Q.12 = C", "3 D", "4,A", "5B"
const PAIR = /(?:^|[^A-Za-z0-9])(?:[Qq](?:uestion)?\.?\s*)?\(?(\d{1,3})\)?\s*[-–—:.)=,]?\s*\(?([A-Fa-f])\)?(?![A-Za-z0-9])/g;

export function parseAnswerKey(text: string): ParsedKey {
  const seen = new Map<number, number>();
  const duplicates: number[] = [];

  const add = (n: number, option: number) => {
    if (n < 1 || n > MAX_Q) return;
    if (seen.has(n)) {
      if (!duplicates.includes(n)) duplicates.push(n);
      return;
    }
    seen.set(n, option);
  };

  for (const m of Array.from(text.matchAll(PAIR))) add(Number(m[1]), m[2].toUpperCase().charCodeAt(0) - 65);

  // No numbers at all, only letters: treat as "A B C D ..." in order from question 1.
  if (seen.size === 0 && /^[\sA-Fa-f,;|/.\-]+$/.test(text) && /[A-Fa-f]/.test(text)) {
    const letters = text.match(/[A-Fa-f]/g) ?? [];
    letters.slice(0, MAX_Q).forEach((l, i) => add(i + 1, l.toUpperCase().charCodeAt(0) - 65));
  }

  return { entries: Array.from(seen.entries()).map(([n, option]) => ({ n, option })).sort((a, b) => a.n - b.n), duplicates };
}

export interface PlanQuestion {
  options: unknown[];
  correctOption: number | null;
}

export interface KeyPlan {
  assign: { n: number; option: number; replaces: number | null }[]; // valid assignments
  invalidOption: { n: number; option: number; optionCount: number }[]; // letter beyond the options
  unknownQuestion: number[]; // numbers larger than the question count
  missing: number[]; // questions the pasted key does not cover
}

export function planAnswerKey(entries: KeyEntry[], questions: PlanQuestion[]): KeyPlan {
  const plan: KeyPlan = { assign: [], invalidOption: [], unknownQuestion: [], missing: [] };
  const covered = new Set<number>();
  for (const e of entries) {
    const q = questions[e.n - 1];
    if (!q) {
      plan.unknownQuestion.push(e.n);
      continue;
    }
    if (e.option >= q.options.length) {
      plan.invalidOption.push({ n: e.n, option: e.option, optionCount: q.options.length });
      continue;
    }
    covered.add(e.n);
    plan.assign.push({ n: e.n, option: e.option, replaces: q.correctOption !== null && q.correctOption !== e.option ? q.correctOption : null });
  }
  for (let i = 1; i <= questions.length; i++) if (!covered.has(i)) plan.missing.push(i);
  return plan;
}

export const letter = (option: number) => String.fromCharCode(65 + option);
