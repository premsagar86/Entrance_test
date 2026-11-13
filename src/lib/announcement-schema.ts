import { z } from "zod";

export const announcementFields = {
  title: z.string().trim().min(1, "Title is required").max(120),
  // Plain text only: rendered by React (escaped), never as HTML.
  body: z.string().trim().min(1, "Message is required").max(1000),
  type: z.enum(["INFO", "MAINTENANCE", "WARNING", "RELEASE_NOTE"]),
  audience: z.enum(["STUDENT", "ADMIN", "ALL"]),
  startsAt: z.iso.datetime().nullable().optional(),
  endsAt: z.iso.datetime().nullable().optional(),
  isActive: z.boolean().optional(),
};

export const endAfterStart = (v: { startsAt?: string | null; endsAt?: string | null }) =>
  !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt);
