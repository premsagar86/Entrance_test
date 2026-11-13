import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseJson } from "@/lib/http";
import { hashDob, normalizeDob } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const createSchema = z.strictObject({
  email: z.email().max(254),
  name: z.string().min(1).max(120),
  rollNo: z.string().min(1).max(40).optional(),
  dob: z.string().max(10),
  batch: z.string().max(60).optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
    const q = (url.searchParams.get("q") ?? "").slice(0, 100);
    const where = q
      ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }, { rollNo: { contains: q, mode: "insensitive" as const } }] }
      : {};
    const [items, total] = await Promise.all([
      db.student.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
        select: { id: true, email: true, name: true, rollNo: true, batch: true, createdAt: true },
      }),
      db.student.count({ where }),
    ]);
    return NextResponse.json({ items, total, page });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await parseJson(req, createSchema);
    const dob = normalizeDob(body.dob);
    if (!dob) return NextResponse.json({ error: "DOB must be YYYY-MM-DD" }, { status: 400 });
    try {
      const s = await db.student.create({
        data: {
          email: body.email.trim().toLowerCase(),
          name: body.name.trim(),
          rollNo: body.rollNo?.trim() || null,
          batch: body.batch?.trim() || null,
          dobHash: hashDob(dob, env().DOB_PEPPER),
        },
        select: { id: true },
      });
      await audit(`admin:${admin.userId}`, "student.create", { id: s.id });
      return NextResponse.json({ id: s.id }, { status: 201 });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "Email or roll number already exists" }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    return handleError(e);
  }
}
