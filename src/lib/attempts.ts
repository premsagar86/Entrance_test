import type { AttemptStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import { scoreAttempt } from "./scoring";

export const GRACE_MS = 5_000;

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
    const ops: Prisma.PrismaPromise<unknown>[] = attempt.answers.map((a) =>
      tx.answer.update({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        data: { isCorrect: r.outcomes.get(a.questionId) ?? null },
      }),
    );
    await Promise.all(ops);
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
  });
}

/** Results are visible once the attempt is finished, unless the admin is holding them. */
export function resultsVisible(test: { holdResults: boolean; resultsReleasedAt: Date | null }): boolean {
  return !test.holdResults || test.resultsReleasedAt !== null;
}
