import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson, parseParam } from "@/lib/http";
import { hashDob, normalizeDob } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(40);
const patchSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  rollNo: z.string().min(1).max(40).nullable().optional(),
  batch: z.string().max(60).nullable().optional(),
  dob: z.string().max(10).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const body = await parseJson(req, patchSchema);
    const { dob, ...rest } = body;
    const data: Record<string, unknown> = { ...rest };
    if (dob !== undefined) {
      const n = normalizeDob(dob);
      if (!n) return NextResponse.json({ error: "DOB must be YYYY-MM-DD" }, { status: 400 });
      data.dobHash = hashDob(n, env().DOB_PEPPER);
    }
    await db.student.update({ where: { id }, data });
    await audit(`admin:${admin.userId}`, "student.update", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((e as { code?: string }).code === "P2002") return NextResponse.json({ error: "Roll number already exists" }, { status: 409 });
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = parseParam(idSchema, params.id);
    const { assertSameOrigin } = await import("@/lib/auth");
    assertSameOrigin(req);
    await db.session.updateMany({ where: { userType: "STUDENT", userId: id }, data: { revokedAt: new Date() } });
    await db.student.delete({ where: { id } });
    await audit(`admin:${admin.userId}`, "student.delete", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((e as { code?: string }).code === "P2003") return NextResponse.json({ error: "Student has attempts; cannot delete" }, { status: 409 });
    return handleError(e);
  }
}
