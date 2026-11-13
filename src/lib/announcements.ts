import type { Audience, Prisma } from "@prisma/client";
import { db } from "./db";

/** Prisma filter for announcements that are active and inside their start/end window right now. */
export function liveWhere(audiences: Audience[], now = new Date()): Prisma.AnnouncementWhereInput {
  return {
    isActive: true,
    audience: { in: audiences },
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
  };
}

/**
 * Maintenance mode = a live MAINTENANCE announcement that targets students.
 * While it is live, students cannot START a test (running attempts continue and can still save and submit).
 */
export async function activeMaintenance(): Promise<{ title: string; body: string } | null> {
  return db.announcement.findFirst({
    where: { ...liveWhere(["STUDENT", "ALL"]), type: "MAINTENANCE" },
    select: { title: true, body: true },
    orderBy: { createdAt: "desc" },
  });
}

export type AnnouncementStatus = "inactive" | "scheduled" | "live" | "expired";

export function announcementStatus(a: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()): AnnouncementStatus {
  if (!a.isActive) return "inactive";
  if (a.startsAt && a.startsAt > now) return "scheduled";
  if (a.endsAt && a.endsAt <= now) return "expired";
  return "live";
}
