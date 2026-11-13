import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, handleError, requireStudent } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { hit } from "@/lib/rate-limit";
import { loadOwnedAttempt } from "@/lib/student-access";
import { MAX_EVENTS_PER_ATTEMPT, eventSchema } from "@/lib/attempt-events";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId: studentId } = await requireStudent();
    const attemptId = parseParam(z.string().min(1).max(40), params.id);
    const body = await parseJson(req, eventSchema, 1024);

    const lim = await hit(`stu:events:${studentId}`, { limit: 60, windowMs: 60_000 });
    if (!lim.allowed) throw new HttpError(429, "Too many events");

    const attempt = await loadOwnedAttempt(attemptId, studentId);
    if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ ok: true, ignored: true });

    const count = await db.attemptEvent.count({ where: { attemptId } });
    if (count >= MAX_EVENTS_PER_ATTEMPT) return NextResponse.json({ ok: true, ignored: true });

    await db.attemptEvent.create({ data: { attemptId, type: body.type } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
