import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cleanupAttempts } from "@/lib/cleanup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Called daily by Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await cleanupAttempts()) });
  } catch (e) {
    console.error("cron cleanup failed", e);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
