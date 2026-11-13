import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, handleError, requireStudent } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { memHit } from "@/lib/mem-limit";
import { GRACE_MS } from "@/lib/attempts";
import { loadAttemptLite } from "@/lib/student-access";
import { MAX_EVENTS_PER_ATTEMPT, eventSchema } from "@/lib/attempt-events";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId: studentId } = await requireStudent();
    const attemptId = parseParam(z.string().min(1).max(40), params.id);
    const body = await parseJson(req, eventSchema, 1024);

    if (!memHit(`events:${studentId}`, 60, 60_000)) throw new HttpError(429, "Too many events");

    const attempt = await loadAttemptLite(attemptId, studentId);
    if (attempt.status !== "IN_PROGRESS" || Date.now() > attempt.expiresAt.getTime() + GRACE_MS) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // One statement: insert unless the per-attempt cap has been reached.
    await db.$executeRaw`
      INSERT INTO attempt_events (id, attempt_id, type, at)
      SELECT gen_random_uuid()::text, ${attemptId}::text, ${body.type}::text, now()
      WHERE (SELECT count(*) FROM attempt_events WHERE attempt_id = ${attemptId}::text) < ${MAX_EVENTS_PER_ATTEMPT}::int`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
