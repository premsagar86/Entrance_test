import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const test = await db.test.findUnique({ where: { id }, include: { questions: true } });
    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (test.status !== "DRAFT") return NextResponse.json({ error: "Already published" }, { status: 409 });
    if (test.questions.length === 0) return NextResponse.json({ error: "Add at least one question" }, { status: 422 });

    // Publish gate: every question needs a valid answer key.
    const missing = test.questions
      .filter((q) => {
        const n = Array.isArray(q.options) ? q.options.length : 0;
        return q.correctOption === null || q.correctOption < 0 || q.correctOption >= n;
      })
      .map((q) => q.order);
    if (missing.length) {
      return NextResponse.json({ error: "Questions without a valid answer key", questionOrders: missing }, { status: 422 });
    }

    const totalMarks = test.questions.reduce((s, q) => s + q.marks, 0);
    await db.test.update({ where: { id }, data: { status: "PUBLISHED", totalMarks } });
    await audit(`admin:${admin.userId}`, "test.publish", { id, totalMarks });
    return NextResponse.json({ ok: true, totalMarks });
  } catch (e) {
    return handleError(e);
  }
}
