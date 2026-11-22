import type { AttemptStatus } from "@prisma/client";
import { db } from "./db";
import { scoreAttempt } from "./scoring";

export const GRACE_MS = 5_000;

/** Prisma's default interactive-transaction timeout is 5 s, too short on a slow or remote database. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

export interface FinalResult {
  attemptId: string;
  testId: string;
  status: AttemptStatus;
  score: number;
  totalMarks: number;
  correct: number;
  wrong: number;
  unanswered: number;
  submittedAt: Date;
}

/**
 * Locks the attempt row, scores it and marks it finished. Idempotent: if the attempt is already
 * finished, the stored result is returned unchanged (so double-submit and submit-after-expiry are harmless).
 */
export async function finalizeAttempt(attemptId: string, finalStatus: "SUBMITTED" | "EXPIRED"): Promise<FinalResult> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM attempts WHERE id = ${attemptId} FOR UPDATE`;
    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { test: { select: { negativeMarking: true } }, answers: true },
    });
    const questions = await tx.question.findMany({
      where: { testId: attempt.testId },
      select: { id: true, correctOption: true, marks: true },
    });
    const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a.selectedOption] as const));
    const r = scoreAttempt(questions, answerMap, attempt.test.negativeMarking);

    if (attempt.status !== "IN_PROGRESS") {
      return {
        attemptId,
        testId: attempt.testId,
        status: attempt.status,
        score: attempt.score ?? r.score,
        totalMarks: r.totalMarks,
        correct: r.correct,
        wrong: r.wrong,
        unanswered: r.unanswered,
        submittedAt: attempt.submittedAt ?? new Date(),
      };
    }

    const now = new Date();
    // Two set-based updates instead of one query per answer: far fewer round trips inside the transaction.
    const idsWhere = (outcome: boolean) => attempt.answers.filter((a) => r.outcomes.get(a.questionId) === outcome).map((a) => a.questionId);
    const correctIds = idsWhere(true);
    const wrongIds = idsWhere(false);
    if (correctIds.length) await tx.answer.updateMany({ where: { attemptId, questionId: { in: correctIds } }, data: { isCorrect: true } });
    if (wrongIds.length) await tx.answer.updateMany({ where: { attemptId, questionId: { in: wrongIds } }, data: { isCorrect: false } });
    await tx.attempt.update({
      where: { id: attemptId },
      data: { status: finalStatus, score: Math.round(r.score), submittedAt: now },
    });
    return {
      attemptId,
      testId: attempt.testId,
      status: finalStatus,
      score: Math.round(r.score),
      totalMarks: r.totalMarks,
      correct: r.correct,
      wrong: r.wrong,
      unanswered: r.unanswered,
      submittedAt: now,
    };
  }, TX_OPTIONS);
}

/** Results are visible once the attempt is finished, unless the admin is holding them. */
export function resultsVisible(test: { holdResults: boolean; resultsReleasedAt: Date | null }): boolean {
  return !test.holdResults || test.resultsReleasedAt !== null;
}
