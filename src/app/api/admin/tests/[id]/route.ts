import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(40);
const patchSchema = z.strictObject({
  title: z.string().min(1).max(200).optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
  startAt: z.iso.datetime().nullable().optional(),
  endAt: z.iso.datetime().nullable().optional(),
  holdResults: z.boolean().optional(),
  showAnswers: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const test = await db.test.findUnique({
      where: { id },
      include: { _count: { select: { questions: true, assignments: true, attempts: true } } },
    });
    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(test);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const b = await parseJson(req, patchSchema);
    const existing = await db.test.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Duration and timing are locked once students may have started.
    if (existing.status !== "DRAFT" && (b.durationMin !== undefined || b.startAt !== undefined)) {
      return NextResponse.json({ error: "Duration/start are locked after publishing" }, { status: 409 });
    }
    await db.test.update({
      where: { id },
      data: {
        ...b,
        startAt: b.startAt === undefined ? undefined : b.startAt ? new Date(b.startAt) : null,
        endAt: b.endAt === undefined ? undefined : b.endAt ? new Date(b.endAt) : null,
      },
    });
    await audit(`admin:${admin.userId}`, "test.update", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
