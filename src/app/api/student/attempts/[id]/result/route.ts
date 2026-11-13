import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, handleError, requireStudent } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { finalizeAttempt, resultsVisible } from "@/lib/attempts";
import { loadOwnedAttempt } from "@/lib/student-access";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId: studentId } = await requireStudent();
    const attemptId = parseParam(z.string().min(1).max(40), params.id);
    const attempt = await loadOwnedAttempt(attemptId, studentId);

    // Answers and results are never exposed while the attempt is running.
    if (attempt.status === "IN_PROGRESS") throw new HttpError(409, "Finish the test to see your result");

    const base = { attemptId, testTitle: attempt.test.title, status: attempt.status, submittedAt: attempt.submittedAt };
    if (!resultsVisible(attempt.test)) {
      return NextResponse.json({ ...base, released: false });
    }

    const r = await finalizeAttempt(attemptId, attempt.status === "EXPIRED" ? "EXPIRED" : "SUBMITTED"); // returns stored result
    const total = r.totalMarks;

    let review: unknown = undefined;
    if (attempt.test.showAnswers) {
      const [questions, answers] = await Promise.all([
        db.question.findMany({ where: { testId: attempt.testId }, orderBy: { order: "asc" }, select: { id: true, text: true, options: true, correctOption: true, explanation: true, marks: true } }),
        db.answer.findMany({ where: { attemptId }, select: { questionId: true, selectedOption: true } }),
      ]);
      const picked = new Map(answers.map((a) => [a.questionId, a.selectedOption]));
      review = questions.map((q) => ({ ...q, selectedOption: picked.get(q.id) ?? null }));
    }

    return NextResponse.json({
      ...base,
      released: true,
      score: r.score,
      totalMarks: total,
      percentage: total > 0 ? Math.round((r.score / total) * 1000) / 10 : 0,
      correct: r.correct,
      wrong: r.wrong,
      unanswered: r.unanswered,
      review,
    });
  } catch (e) {
    return handleError(e);
  }
}
