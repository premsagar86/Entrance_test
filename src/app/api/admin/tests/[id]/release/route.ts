import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Releases held results to students. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const t = await db.test.findUnique({ where: { id }, select: { status: true } });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (t.status === "DRAFT") return NextResponse.json({ error: "Publish the test first" }, { status: 409 });
    await db.test.update({ where: { id }, data: { resultsReleasedAt: new Date() } });
    await audit(`admin:${admin.userId}`, "test.release", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
