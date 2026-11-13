import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleError } from "@/lib/auth";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await getSession("ADMIN");
    if (admin) {
      const a = await db.admin.findUnique({ where: { id: admin.userId }, select: { name: true, email: true } });
      return NextResponse.json({ role: "ADMIN", ...a });
    }
    const student = await getSession("STUDENT");
    if (student) {
      const s = await db.student.findUnique({ where: { id: student.userId }, select: { name: true, email: true } });
      return NextResponse.json({ role: "STUDENT", ...s });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (e) {
    return handleError(e);
  }
}
