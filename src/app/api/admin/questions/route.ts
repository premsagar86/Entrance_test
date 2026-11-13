import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const options = z.array(z.string().min(1).max(500)).min(2).max(6);
const schema = z
  .strictObject({
    testId: z.string().min(1).max(40),
    text: z.string().min(1).max(4000),
    options,
    correctOption: z.number().int().min(0).max(5).nullable().optional(),
    marks: z.number().int().min(1).max(100).optional(),
    explanation: z.string().max(4000).optional(),
  })
  .refine((v) => v.correctOption == null || v.correctOption < v.options.length, "Answer index out of range");

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const b = await parseJson(req, schema);
    const test = await db.test.findUnique({ where: { id: b.testId }, select: { status: true } });
    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });
    if (test.status !== "DRAFT") return NextResponse.json({ error: "Test is published; questions are locked" }, { status: 409 });
    const last = await db.question.findFirst({ where: { testId: b.testId }, orderBy: { order: "desc" }, select: { order: true } });
    const q = await db.question.create({
      data: {
        testId: b.testId,
        text: b.text,
        options: b.options,
        correctOption: b.correctOption ?? null,
        marks: b.marks ?? 1,
        explanation: b.explanation ?? null,
        order: (last?.order ?? 0) + 1,
      },
      select: { id: true },
    });
    await audit(`admin:${admin.userId}`, "question.create", { id: q.id });
    return NextResponse.json({ id: q.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
