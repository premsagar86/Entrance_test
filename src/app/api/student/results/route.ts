import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleError, requireStudent } from "@/lib/auth";
import { resultsVisible } from "@/lib/attempts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId: studentId } = await requireStudent();
    const attempts = await db.attempt.findMany({
      where: { studentId, status: { not: "IN_PROGRESS" } },
      orderBy: { submittedAt: "desc" },
      take: 100,
      select: { id: true, score: true, status: true, submittedAt: true, test: { select: { title: true, totalMarks: true, holdResults: true, resultsReleasedAt: true } } },
    });
    return NextResponse.json({
      items: attempts.map((a) => {
        const visible = resultsVisible(a.test);
        return { id: a.id, title: a.test.title, status: a.status, submittedAt: a.submittedAt, released: visible, score: visible ? a.score : null, totalMarks: visible ? a.test.totalMarks : null };
      }),
    });
  } catch (e) {
    return handleError(e);
  }
}
