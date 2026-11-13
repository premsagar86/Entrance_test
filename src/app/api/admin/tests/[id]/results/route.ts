import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { loadTestResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const data = await loadTestResults(id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return handleError(e);
  }
}
