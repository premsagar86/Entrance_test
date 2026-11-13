import { NextResponse } from "next/server";
import type { UserType } from "@prisma/client";
import { getSession, type SessionInfo } from "./session";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Re-check session + role inside every handler (middleware is only a coarse guard). */
export async function requireUser(userType: UserType): Promise<SessionInfo> {
  const s = await getSession(userType);
  if (!s) throw new HttpError(401, "Unauthorized");
  return s;
}

export const requireAdmin = () => requireUser("ADMIN");
export const requireStudent = () => requireUser("STUDENT");

/** CSRF defence in depth: same-origin Origin header plus custom header on state-changing requests. */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new HttpError(403, "Forbidden");
  if (req.headers.get("x-requested-with") !== "fetch") throw new HttpError(403, "Forbidden");
}

export function handleError(e: unknown) {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
