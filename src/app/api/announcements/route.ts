import { NextResponse } from "next/server";
import type { Audience, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleError } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { liveWhere } from "@/lib/announcements";

export const dynamic = "force-dynamic";

/**
 * Live announcements for whoever is asking:
 *  - signed-in admin: ADMIN + ALL;  signed-in student: STUDENT + ALL (minus ones they dismissed)
 *  - anonymous (login pages): only audience ALL, never release notes. Plain text, no user data.
 */
export async function GET(req: Request) {
  try {
    const admin = await getSession("ADMIN");
    const student = admin ? null : await getSession("STUDENT");
    const who = admin ? ({ userType: "ADMIN", userId: admin.userId } as const) : student ? ({ userType: "STUDENT", userId: student.userId } as const) : null;

    // ?all=1 (signed-in users only): also include notices already dismissed, for the announcements page.
    const includeDismissed = !!who && new URL(req.url).searchParams.get("all") === "1";
    const audiences: Audience[] = who ? [who.userType, "ALL"] : ["ALL"];
    const where: Prisma.AnnouncementWhereInput = {
      ...liveWhere(audiences),
      ...(who ? (includeDismissed ? {} : { dismissals: { none: { userType: who.userType, userId: who.userId } } }) : { type: { not: "RELEASE_NOTE" } }),
    };
    const items = await db.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, type: true, createdAt: true },
    });
    return NextResponse.json({ scope: who ? "user" : "public", items }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return handleError(e);
  }
}
