import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Server clock in epoch ms, for client-side timer sync. Public and cheap by design. */
export function GET() {
  return NextResponse.json({ serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
