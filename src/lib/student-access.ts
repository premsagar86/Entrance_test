import { db } from "./db";
import { HttpError } from "./auth";
import { GRACE_MS, finalizeAttempt } from "./attempts";

/**
 * Loads an attempt only if it belongs to the student. Returns the same 404 for "missing" and
 * "someone else's" so attempt ids cannot be probed (IDOR).
 * An in-progress attempt that is past its deadline is finalized as EXPIRED on the spot.
 */
export async function loadOwnedAttempt(attemptId: string, studentId: string) {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: { test: { select: { id: true, title: true, status: true, holdResults: true, showAnswers: true, resultsReleasedAt: true, totalMarks: true } } },
  });
  if (!attempt || attempt.studentId !== studentId) throw new HttpError(404, "Not found");

  if (attempt.status === "IN_PROGRESS" && Date.now() > attempt.expiresAt.getTime() + GRACE_MS) {
    await finalizeAttempt(attempt.id, "EXPIRED");
    return db.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { test: { select: { id: true, title: true, status: true, holdResults: true, showAnswers: true, resultsReleasedAt: true, totalMarks: true } } },
    });
  }
  return attempt;
}

export type TestState = "upcoming" | "open" | "closed" | "in_progress" | "submitted" | "expired";
