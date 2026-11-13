import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { loadTestResults } from "@/lib/results";
import { summarizeEvents } from "@/lib/attempt-events";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const data = await loadTestResults(id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const events = await db.attemptEvent.findMany({ where: { attempt: { testId: id } }, select: { attemptId: true, type: true } });
    const byAttempt = new Map<string, string[]>();
    for (const e of events) byAttempt.set(e.attemptId, [...(byAttempt.get(e.attemptId) ?? []), e.type]);
    const flagged = Array.from(byAttempt, ([attemptId, types]) => ({ attemptId, ...summarizeEvents(types) })).sort((a, b) => b.total - a.total);

    return NextResponse.json({
      test: data.test,
      stats: data.stats,
      distribution: data.distribution,
      questionStats: data.questionStats,
      integrity: flagged,
    });
  } catch (e) {
    return handleError(e);
  }
}
