import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const testId = parseParam(z.string().min(1).max(40), params.id);
    const items = await db.question.findMany({ where: { testId }, orderBy: { order: "asc" } });
    return NextResponse.json({ items });
  } catch (e) {
    return handleError(e);
  }
}
