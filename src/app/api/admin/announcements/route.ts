import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson } from "@/lib/http";
import { audit } from "@/lib/audit";
import { announcementStatus } from "@/lib/announcements";
import { announcementFields, endAfterStart } from "@/lib/announcement-schema";

export const dynamic = "force-dynamic";

const createSchema = z.strictObject(announcementFields).refine(endAfterStart, "End must be after the start");

export async function GET() {
  try {
    await requireAdmin();
    const items = await db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json({ items: items.map((a) => ({ ...a, status: announcementStatus(a) })) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const b = await parseJson(req, createSchema);
    const a = await db.announcement.create({
      data: {
        title: b.title,
        body: b.body,
        type: b.type,
        audience: b.audience,
        startsAt: b.startsAt ? new Date(b.startsAt) : null,
        endsAt: b.endsAt ? new Date(b.endsAt) : null,
        isActive: b.isActive ?? true,
        createdBy: admin.userId,
      },
      select: { id: true },
    });
    await audit(`admin:${admin.userId}`, "announcement.create", { id: a.id, type: b.type, audience: b.audience });
    return NextResponse.json({ id: a.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
