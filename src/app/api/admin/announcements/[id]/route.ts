import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";
import { announcementFields, endAfterStart } from "@/lib/announcement-schema";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(40);
const patchSchema = z.strictObject({
  title: announcementFields.title.optional(),
  body: announcementFields.body.optional(),
  type: announcementFields.type.optional(),
  audience: announcementFields.audience.optional(),
  startsAt: announcementFields.startsAt,
  endsAt: announcementFields.endsAt,
  isActive: announcementFields.isActive,
}).refine(endAfterStart, "End must be after the start");

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const b = await parseJson(req, patchSchema);
    const existing = await db.announcement.findUnique({ where: { id }, select: { startsAt: true, endsAt: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The refine above only sees fields in this request; re-check against stored dates too.
    const start = b.startsAt === undefined ? existing.startsAt : b.startsAt ? new Date(b.startsAt) : null;
    const end = b.endsAt === undefined ? existing.endsAt : b.endsAt ? new Date(b.endsAt) : null;
    if (start && end && end <= start) return NextResponse.json({ error: "End must be after the start" }, { status: 400 });

    await db.announcement.update({
      where: { id },
      data: {
        ...(b.title !== undefined && { title: b.title }),
        ...(b.body !== undefined && { body: b.body }),
        ...(b.type !== undefined && { type: b.type }),
        ...(b.audience !== undefined && { audience: b.audience }),
        ...(b.isActive !== undefined && { isActive: b.isActive }),
        ...(b.startsAt !== undefined && { startsAt: start }),
        ...(b.endsAt !== undefined && { endsAt: end }),
      },
    });
    await audit(`admin:${admin.userId}`, "announcement.update", { id });
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
    const r = await db.announcement.deleteMany({ where: { id } });
    if (r.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await audit(`admin:${admin.userId}`, "announcement.delete", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
