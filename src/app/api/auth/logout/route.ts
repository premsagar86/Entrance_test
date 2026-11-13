import { NextResponse } from "next/server";
import { assertSameOrigin, handleError } from "@/lib/auth";
import { destroySession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await destroySession("STUDENT");
    await destroySession("ADMIN");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
