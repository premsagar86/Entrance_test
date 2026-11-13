import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, handleError, requireStudent } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { GRACE_MS, finalizeAttempt } from "@/lib/attempts";
import { loadOwnedAttempt } from "@/lib/student-access";
import { getOptionCounts } from "@/lib/question-cache";

export const dynamic = "force-dynamic";

const schema = z.strictObject({
  answers: z
    .array(z.strictObject({ questionId: z.string().min(1).max(40), selectedOption: z.number().int().min(0).max(5).nullable() }))
    .min(1)
    .max(500),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId: studentId } = await requireStudent();
    const attemptId = parseParam(z.string().min(1).max(40), params.id);
    const body = await parseJson(req, schema, 128 * 1024);

    const lim = await hit(`stu:autosave:${studentId}`, { limit: 120, windowMs: 60_000 });
    if (!lim.allowed) throw new HttpError(429, "Saving too quickly");

    const attempt = await loadOwnedAttempt(attemptId, studentId);
    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({ error: "This attempt is already finished.", expired: true }, { status: 409 });
    }
    // Past the deadline (plus a small grace for slow networks): finish it and refuse the write.
    if (Date.now() > attempt.expiresAt.getTime() + GRACE_MS) {
      await finalizeAttempt(attempt.id, "EXPIRED");
      return NextResponse.json({ error: "Time is up. Your answers were submitted.", expired: true }, { status: 409 });
    }

    // Only accept real questions of this test, with an option index that exists.
    const optionCount = await getOptionCounts(attempt.testId);
    for (const a of body.answers) {
      const n = optionCount.get(a.questionId);
      if (n === undefined) throw new HttpError(400, "Unknown question");
      if (a.selectedOption !== null && a.selectedOption >= n) throw new HttpError(400, "Invalid option");
    }
    // Last write wins per question within one batch.
    const latest = new Map(body.answers.map((a) => [a.questionId, a.selectedOption] as const));

    await db.$transaction(
      Array.from(latest).map(([questionId, selectedOption]) =>
        db.answer.upsert({
          where: { attemptId_questionId: { attemptId, questionId } },
          create: { attemptId, questionId, selectedOption },
          update: { selectedOption, answeredAt: new Date() },
        }),
      ),
    );
    return NextResponse.json({ ok: true, saved: latest.size, serverNow: Date.now() });
  } catch (e) {
    return handleError(e);
  }
}
