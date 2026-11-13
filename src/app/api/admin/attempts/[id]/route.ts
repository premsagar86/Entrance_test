import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";

export const dynamic = "force-dynamic";

/** One student's attempt with every question, their pick and the correct option. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const attempt = await db.attempt.findUnique({
      where: { id },
      include: {
        student: { select: { name: true, email: true, rollNo: true, batch: true } },
        test: { select: { title: true } },
        answers: { select: { questionId: true, selectedOption: true } },
      },
    });
    if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const questions = await db.question.findMany({
      where: { testId: attempt.testId },
      orderBy: { order: "asc" },
      select: { id: true, text: true, options: true, correctOption: true, marks: true, order: true },
    });
    const picked = new Map(attempt.answers.map((a) => [a.questionId, a.selectedOption]));
    return NextResponse.json({
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      student: attempt.student,
      testTitle: attempt.test.title,
      questions: questions.map((q) => ({ ...q, selectedOption: picked.get(q.id) ?? null })),
    });
  } catch (e) {
    return handleError(e);
  }
}
