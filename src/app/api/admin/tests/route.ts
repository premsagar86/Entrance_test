import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const createSchema = z
  .strictObject({
    title: z.string().min(1).max(200),
    durationMin: z.number().int().min(1).max(600),
    startAt: z.iso.datetime().optional(),
    endAt: z.iso.datetime().optional(),
    holdResults: z.boolean().optional(),
    showAnswers: z.boolean().optional(),
  })
  .refine((v) => !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt), "End must be after start");

export async function GET() {
  try {
    await requireAdmin();
    const tests = await db.test.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { questions: true, assignments: true, attempts: true } } },
    });
    return NextResponse.json({ items: tests });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const b = await parseJson(req, createSchema);
    const t = await db.test.create({
      data: {
        title: b.title.trim(),
        durationMin: b.durationMin,
        startAt: b.startAt ? new Date(b.startAt) : null,
        endAt: b.endAt ? new Date(b.endAt) : null,
        holdResults: b.holdResults ?? false,
        showAnswers: b.showAnswers ?? false,
      },
      select: { id: true },
    });
    await audit(`admin:${admin.userId}`, "test.create", { id: t.id });
    return NextResponse.json({ id: t.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
