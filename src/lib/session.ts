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

/**
 * Short in-memory cache of validated STUDENT sessions (per server instance). Every API call re-checks the
 * session, which would otherwise be one database read per request; with hundreds of students autosaving that
 * is the biggest avoidable load. Revocation (logout / new login elsewhere) can take up to the TTL to reach
 * other instances, which is acceptable for students. Admin sessions are never cached.
 */
const SESSION_CACHE_TTL_MS = 30_000;
const SESSION_CACHE_MAX = 5_000;
const sessionCache = new Map<string, { info: SessionInfo; cachedAt: number; expiresAt: number; absoluteExpiresAt: number }>();

function cacheSession(idHash: string, info: SessionInfo, expiresAt: number, absoluteExpiresAt: number) {
  if (sessionCache.size >= SESSION_CACHE_MAX) sessionCache.delete(sessionCache.keys().next().value as string);
  sessionCache.set(idHash, { info, cachedAt: Date.now(), expiresAt, absoluteExpiresAt });
}

/** Validates the cookie against the DB and slides the idle window. */
export async function getSession(userType: UserType): Promise<SessionInfo | null> {
  const token = cookies().get(COOKIE_NAMES[userType])?.value;
  if (!token) return null;
  const idHash = sha256(token);
  if (userType === "STUDENT") {
    const c = sessionCache.get(idHash);
    const t = Date.now();
    if (c && t - c.cachedAt < SESSION_CACHE_TTL_MS && t < c.expiresAt && t < c.absoluteExpiresAt) return c.info;
  }
  const row = await db.session.findUnique({ where: { idHash } });
  const now = new Date();
  if (
    !row ||
    row.userType !== userType ||
    row.revokedAt ||
    row.expiresAt <= now ||
    row.absoluteExpiresAt <= now
  ) {
    sessionCache.delete(idHash);
    return null;
  }
  const idleMs = SESSION_POLICY[userType].idleMs;
  const next = new Date(Math.min(now.getTime() + idleMs, row.absoluteExpiresAt.getTime()));
  let expiresAtMs = row.expiresAt.getTime();
  if (next.getTime() - expiresAtMs > MIN) {
    await db.session.update({ where: { idHash: row.idHash }, data: { expiresAt: next } });
    expiresAtMs = next.getTime();
  }
  const info = { userType: row.userType, userId: row.userId };
  if (userType === "STUDENT") cacheSession(idHash, info, expiresAtMs, row.absoluteExpiresAt.getTime());
  return info;
}

export async function destroySession(userType: UserType) {
  const token = cookies().get(COOKIE_NAMES[userType])?.value;
  if (token) {
    sessionCache.delete(sha256(token));
    await db.session.updateMany({
      where: { idHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookies().delete(COOKIE_NAMES[userType]);
}
