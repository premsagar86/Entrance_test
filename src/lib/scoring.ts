export interface ScoringQuestion {
  id: string;
  correctOption: number | null;
  marks: number;
}

export interface ScoreResult {
  score: number;
  totalMarks: number;
  correct: number;
  wrong: number;
  unanswered: number;
  /** Per-question outcome, used to persist `is_correct`. null = unanswered. */
  outcomes: Map<string, boolean | null>;
}

/**
 * Pure scoring. `answers` maps questionId -> selected option index (or null/undefined for blank).
 * `negativeMarking` is the fraction of a question's marks deducted per wrong answer (0 = none).
 * The total is floored at 0.
 */
export function scoreAttempt(questions: ScoringQuestion[], answers: Map<string, number | null>, negativeMarking = 0): ScoreResult {
  let gained = 0;
  let totalMarks = 0;
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const outcomes = new Map<string, boolean | null>();

  for (const q of questions) {
    totalMarks += q.marks;
    const picked = answers.get(q.id);
    if (picked === null || picked === undefined) {
      unanswered++;
      outcomes.set(q.id, null);
    } else if (q.correctOption !== null && picked === q.correctOption) {
      correct++;
      gained += q.marks;
      outcomes.set(q.id, true);
    } else {
      wrong++;
      gained -= negativeMarking * q.marks;
      outcomes.set(q.id, false);
    }
  }
  return { score: Math.max(0, Math.round(gained * 100) / 100), totalMarks, correct, wrong, unanswered, outcomes };
}
