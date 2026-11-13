import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleError, requireStudent } from "@/lib/auth";
import { GRACE_MS, finalizeAttempt, resultsVisible } from "@/lib/attempts";
import type { TestState } from "@/lib/student-access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId: studentId } = await requireStudent();
    const now = Date.now();

    const assignments = await db.testAssignment.findMany({
      where: { studentId, test: { status: "PUBLISHED" } },
      select: {
        test: {
          select: {
            id: true,
            title: true,
            durationMin: true,
            totalMarks: true,
            startAt: true,
            endAt: true,
            holdResults: true,
            resultsReleasedAt: true,
            _count: { select: { questions: true } },
          },
        },
      },
    });
    const testIds = assignments.map((a) => a.test.id);
    let attempts = await db.attempt.findMany({ where: { studentId, testId: { in: testIds } } });

    // Finalize any attempt that ran out of time while the student was away.
    const stale = attempts.filter((a) => a.status === "IN_PROGRESS" && now > a.expiresAt.getTime() + GRACE_MS);
    if (stale.length) {
      await Promise.all(stale.map((a) => finalizeAttempt(a.id, "EXPIRED")));
      attempts = await db.attempt.findMany({ where: { studentId, testId: { in: testIds } } });
    }
    const byTest = new Map(attempts.map((a) => [a.testId, a]));

    const items = assignments.map(({ test }) => {
      const a = byTest.get(test.id);
      let state: TestState;
      if (a) state = a.status === "IN_PROGRESS" ? "in_progress" : a.status === "SUBMITTED" ? "submitted" : "expired";
      else if (test.startAt && test.startAt.getTime() > now) state = "upcoming";
      else if (test.endAt && test.endAt.getTime() <= now) state = "closed";
      else state = "open";

      const finished = state === "submitted" || state === "expired";
      const visible = finished && resultsVisible(test);
      return {
        id: test.id,
        title: test.title,
        durationMin: test.durationMin,
        questionCount: test._count.questions,
        totalMarks: test.totalMarks,
        startAt: test.startAt,
        endAt: test.endAt,
        state,
        attemptId: a?.id ?? null,
        expiresAt: state === "in_progress" ? a?.expiresAt : null,
        resultVisible: visible,
        score: visible ? a?.score ?? null : null,
      };
    });
    items.sort((x, y) => Number(y.state === "in_progress") - Number(x.state === "in_progress") || Number(y.state === "open") - Number(x.state === "open"));
    return NextResponse.json({ items, serverNow: now });
  } catch (e) {
    return handleError(e);
  }
}
