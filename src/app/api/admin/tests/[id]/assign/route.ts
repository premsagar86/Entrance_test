import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.strictObject({ studentIds: z.array(z.string().max(40)).min(1).max(2000) }),
  z.strictObject({ batch: z.string().min(1).max(60) }),
  z.strictObject({ all: z.literal(true) }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const testId = parseParam(z.string().min(1).max(40), params.id);
    const b = await parseJson(req, schema, 256 * 1024);
    if (!(await db.test.findUnique({ where: { id: testId }, select: { id: true } }))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const where = "studentIds" in b ? { id: { in: b.studentIds } } : "batch" in b ? { batch: b.batch } : {};
    const students = await db.student.findMany({ where, select: { id: true } });
    const r = await db.testAssignment.createMany({
      data: students.map((s) => ({ testId, studentId: s.id })),
      skipDuplicates: true,
    });
    await audit(`admin:${admin.userId}`, "test.assign", { testId, added: r.count });
    return NextResponse.json({ assigned: r.count, matched: students.length });
  } catch (e) {
    return handleError(e);
  }
}
