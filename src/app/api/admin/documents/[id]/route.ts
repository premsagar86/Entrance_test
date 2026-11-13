import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const doc = await db.document.findUnique({
      where: { id },
      select: {
        id: true,
        filename: true,
        status: true,
        createdAt: true,
        tests: { select: { id: true, status: true, _count: { select: { questions: true } } } },
      },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (e) {
    return handleError(e);
  }
}
