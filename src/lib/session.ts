import { cookies } from "next/headers";
import type { UserType } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

const MIN = 60_000;

export const SESSION_POLICY = {
  // Admin: 2h idle, 8h absolute. Student: idle window covers a typical test plus buffer.
  ADMIN: { idleMs: 120 * MIN, absoluteMs: 8 * 60 * MIN },
  STUDENT: { idleMs: 4 * 60 * MIN, absoluteMs: 6 * 60 * MIN },
} as const;

export const COOKIE_NAMES: Record<UserType, string> = {
  STUDENT: "at_student",
  ADMIN: "at_admin",
};

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userType: UserType, userId: string) {
  const policy = SESSION_POLICY[userType];
  const now = Date.now();
  const token = randomToken(32);
  const expiresAt = new Date(now + policy.idleMs);
  const absoluteExpiresAt = new Date(now + policy.absoluteMs);

  // Rotate: revoke earlier sessions for this user on login.
  await db.session.updateMany({
    where: { userType, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db.session.create({
    data: { idHash: sha256(token), userType, userId, expiresAt, absoluteExpiresAt },
  });
  cookies().set(COOKIE_NAMES[userType], token, cookieOptions(absoluteExpiresAt));
}

export interface SessionInfo {
  userType: UserType;
  userId: string;
}

/** Validates the cookie against the DB and slides the idle window. */
export async function getSession(userType: UserType): Promise<SessionInfo | null> {
  const token = cookies().get(COOKIE_NAMES[userType])?.value;
  if (!token) return null;
  const row = await db.session.findUnique({ where: { idHash: sha256(token) } });
  const now = new Date();
  if (
    !row ||
    row.userType !== userType ||
    row.revokedAt ||
    row.expiresAt <= now ||
    row.absoluteExpiresAt <= now
  ) {
    return null;
  }
  const idleMs = SESSION_POLICY[userType].idleMs;
  const next = new Date(Math.min(now.getTime() + idleMs, row.absoluteExpiresAt.getTime()));
  if (next.getTime() - row.expiresAt.getTime() > MIN) {
    await db.session.update({ where: { idHash: row.idHash }, data: { expiresAt: next } });
  }
  return { userType: row.userType, userId: row.userId };
}

export async function destroySession(userType: UserType) {
  const token = cookies().get(COOKIE_NAMES[userType])?.value;
  if (token) {
    await db.session.updateMany({
      where: { idHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookies().delete(COOKIE_NAMES[userType]);
}
