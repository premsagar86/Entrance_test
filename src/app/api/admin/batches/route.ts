import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Distinct batch names with student counts, for the admin batch pickers. */
export async function GET() {
  try {
    await requireAdmin();
    const [groups, total] = await Promise.all([
      db.student.groupBy({ by: ["batch"], where: { batch: { not: null } }, _count: { _all: true }, orderBy: { batch: "asc" } }),
      db.student.count(),
    ]);
    const items = groups.filter((g) => g.batch && g.batch.trim()).map((g) => ({ name: g.batch as string, count: g._count._all }));
    return NextResponse.json({ items, total });
  } catch (e) {
    return handleError(e);
  }
}
