import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(40);
const patchSchema = z.strictObject({
  text: z.string().min(1).max(4000).optional(),
  options: z.array(z.string().min(1).max(500)).min(2).max(6).optional(),
  correctOption: z.number().int().min(0).max(5).nullable().optional(),
  marks: z.number().int().min(1).max(100).optional(),
  explanation: z.string().max(4000).nullable().optional(),
});

async function loadDraft(id: string) {
  const q = await db.question.findUnique({ where: { id }, include: { test: { select: { status: true } } } });
  if (!q) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  if (q.test.status !== "DRAFT") {
    return { error: NextResponse.json({ error: "Test is published; questions are locked" }, { status: 409 }) } as const;
  }
  return { q } as const;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const b = await parseJson(req, patchSchema);
    const r = await loadDraft(id);
    if ("error" in r) return r.error;
    const optCount = (b.options ?? (r.q.options as unknown[])).length;
    const correct = b.correctOption === undefined ? r.q.correctOption : b.correctOption;
    if (correct !== null && correct >= optCount) {
      return NextResponse.json({ error: "Answer index out of range" }, { status: 400 });
    }
    await db.question.update({ where: { id }, data: b });
    await audit(`admin:${admin.userId}`, "question.update", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const r = await loadDraft(id);
    if ("error" in r) return r.error;
    await db.question.delete({ where: { id } });
    await audit(`admin:${admin.userId}`, "question.delete", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
