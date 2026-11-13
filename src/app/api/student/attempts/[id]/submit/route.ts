import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handleError, requireStudent } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { GRACE_MS, finalizeAttempt, resultsVisible } from "@/lib/attempts";
import { loadOwnedAttempt } from "@/lib/student-access";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Idempotent: submitting twice, or after expiry, returns the stored result. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const { userId: studentId } = await requireStudent();
    const attemptId = parseParam(z.string().min(1).max(40), params.id);
    const attempt = await loadOwnedAttempt(attemptId, studentId);

    const late = Date.now() > attempt.expiresAt.getTime() + GRACE_MS;
    const r = await finalizeAttempt(attempt.id, late ? "EXPIRED" : "SUBMITTED");
    if (attempt.status === "IN_PROGRESS") await audit(`student:${studentId}`, "attempt.submit", { attemptId, status: r.status });

    const visible = resultsVisible(attempt.test);
    return NextResponse.json({
      attemptId: r.attemptId,
      status: r.status,
      resultVisible: visible,
      ...(visible ? { score: r.score, totalMarks: r.totalMarks, correct: r.correct, wrong: r.wrong, unanswered: r.unanswered } : {}),
    });
  } catch (e) {
    return handleError(e);
  }
}
