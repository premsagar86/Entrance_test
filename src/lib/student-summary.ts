import type { TestState } from "@/lib/student-access";

export interface SummaryItem {
  state: TestState;
  score: number | null;
  totalMarks: number;
  resultVisible: boolean;
}

export type Filter = "all" | "available" | "in_progress" | "completed" | "other";

export function filterOf(state: TestState): Exclude<Filter, "all"> {
  if (state === "open") return "available";
  if (state === "in_progress") return "in_progress";
  if (state === "submitted" || state === "expired") return "completed";
  return "other"; // upcoming, closed
}

export function percent(score: number | null, total: number): number | null {
  if (score === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
}

/** Counts and average score. The average only uses tests whose result is visible to the student. */
export function summarise(items: SummaryItem[]) {
  const counts = { all: items.length, available: 0, in_progress: 0, completed: 0, other: 0 };
  const pcts: number[] = [];
  for (const i of items) {
    counts[filterOf(i.state)]++;
    if (i.resultVisible) {
      const p = percent(i.score, i.totalMarks);
      if (p !== null) pcts.push(p);
    }
  }
  const averagePct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  return { counts, averagePct, completedRatio: items.length ? counts.completed / items.length : 0 };
}
