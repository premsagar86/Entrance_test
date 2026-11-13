import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Deletes the attempt (and its answers) so the student can take the test again. Audit-logged. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const attempt = await db.attempt.findUnique({ where: { id }, select: { testId: true, studentId: true, status: true, score: true } });
    if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.attempt.delete({ where: { id } });
    await audit(`admin:${admin.userId}`, "attempt.reset", { attemptId: id, testId: attempt.testId, studentId: attempt.studentId, previousStatus: attempt.status, previousScore: attempt.score });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
