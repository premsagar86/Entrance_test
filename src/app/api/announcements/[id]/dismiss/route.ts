import { NextResponse } from "next/server";
import { z } from "zod";
import type { Audience } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError, assertSameOrigin, handleError } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Remembers, per signed-in user, that an announcement was dismissed (so "What's new" shows once). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const id = parseParam(z.string().min(1).max(40), params.id);
    const admin = await getSession("ADMIN");
    const student = admin ? null : await getSession("STUDENT");
    const who = admin ? ({ userType: "ADMIN", userId: admin.userId } as const) : student ? ({ userType: "STUDENT", userId: student.userId } as const) : null;
    if (!who) throw new HttpError(401, "Unauthorized");

    const audiences: Audience[] = [who.userType, "ALL"];
    const a = await db.announcement.findFirst({ where: { id, audience: { in: audiences } }, select: { id: true } });
    if (!a) throw new HttpError(404, "Not found"); // same answer for missing and not-for-you

    await db.announcementDismissal.upsert({
      where: { announcementId_userType_userId: { announcementId: id, userType: who.userType, userId: who.userId } },
      create: { announcementId: id, userType: who.userType, userId: who.userId },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
