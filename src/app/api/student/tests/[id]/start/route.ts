import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, assertSameOrigin, handleError, requireStudent } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { GRACE_MS, finalizeAttempt } from "@/lib/attempts";
import { audit } from "@/lib/audit";
import { activeMaintenance } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const { userId: studentId } = await requireStudent();
    const testId = parseParam(z.string().min(1).max(40), params.id);

    const lim = await hit(`stu:start:${studentId}`, { limit: 30, windowMs: 60_000 });
    if (!lim.allowed) throw new HttpError(429, "Too many requests. Please wait a moment.");

    // Same 404 whether the test does not exist, is unpublished, or is not assigned to this student.
    const test = await db.test.findFirst({
      where: { id: testId, status: "PUBLISHED", assignments: { some: { studentId } } },
      include: { questions: { orderBy: { order: "asc" }, select: { id: true, text: true, options: true, marks: true } } },
    });
    if (!test) throw new HttpError(404, "Test not found");
    if (test.questions.length === 0) throw new HttpError(409, "This test has no questions yet");

    const now = Date.now();
    let attempt = await db.attempt.findUnique({ where: { testId_studentId: { testId, studentId } } });

    if (attempt && attempt.status === "IN_PROGRESS" && now > attempt.expiresAt.getTime() + GRACE_MS) {
      await finalizeAttempt(attempt.id, "EXPIRED");
      attempt = await db.attempt.findUnique({ where: { id: attempt.id } });
    }
    if (attempt && attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "You have already attempted this test.", attemptId: attempt.id, finished: true }, { status: 409 });
    }

    if (!attempt) {
      // Maintenance mode only blocks NEW attempts. Resuming a running attempt (handled above) is never blocked.
      const maintenance = await activeMaintenance();
      if (maintenance) throw new HttpError(503, `Tests cannot be started right now: ${maintenance.title}. Please try again later.`);
      if (test.startAt && test.startAt.getTime() > now) throw new HttpError(403, "This test has not opened yet");
      if (test.endAt && test.endAt.getTime() <= now) throw new HttpError(403, "This test has closed");
      // Time is capped by the closing time so nobody runs past the window.
      const byDuration = now + test.durationMin * 60_000;
      const expiresAt = new Date(test.endAt ? Math.min(byDuration, test.endAt.getTime()) : byDuration);
      try {
        attempt = await db.attempt.create({ data: { testId, studentId, expiresAt } });
        await audit(`student:${studentId}`, "attempt.start", { testId, attemptId: attempt.id });
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        attempt = await db.attempt.findUniqueOrThrow({ where: { testId_studentId: { testId, studentId } } }); // double-click race
      }
    }

    const saved = await db.answer.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, selectedOption: true } });
    return NextResponse.json({
      attemptId: attempt.id,
      title: test.title,
      durationMin: test.durationMin,
      expiresAt: attempt.expiresAt,
      serverNow: now,
      // correctOption and explanation are deliberately never selected here.
      questions: test.questions,
      answers: Object.fromEntries(saved.map((a) => [a.questionId, a.selectedOption])),
    });
  } catch (e) {
    return handleError(e);
  }
}
