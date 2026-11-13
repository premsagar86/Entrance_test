import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError, assertSameOrigin, handleError, requireAdmin } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { hashDob, normalizeDob } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_000_000;
const MAX_ROWS = 2000;
const rowSchema = z.object({
  email: z.email().max(254),
  name: z.string().min(1).max(120),
  rollNo: z.string().max(40).optional(),
  batch: z.string().max(60).optional(),
});

/** Body: raw CSV text with header: email,name,dob,rollNo,batch */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const text = await req.text();
    if (text.length > MAX_BYTES) throw new HttpError(413, "File too large");
    const rows = parseCsv(text);
    if (rows.length < 2) throw new HttpError(400, "CSV has no data rows");
    if (rows.length - 1 > MAX_ROWS) throw new HttpError(400, `Max ${MAX_ROWS} rows`);

    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_]/g, ""));
    const col = (n: string) => header.indexOf(n);
    for (const required of ["email", "name", "dob"]) {
      if (col(required) < 0) throw new HttpError(400, `Missing column: ${required}`);
    }

    const pepper = env().DOB_PEPPER;
    const seen = new Set<string>();
    const seenRoll = new Set<string>();
    const valid: { email: string; name: string; rollNo: string | null; batch: string | null; dobHash: string }[] = [];
    const errors: { row: number; error: string }[] = [];

    rows.slice(1).forEach((r, i) => {
      const line = i + 2;
      const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? "").trim() : "");
      const parsed = rowSchema.safeParse({
        email: get("email").toLowerCase(),
        name: get("name"),
        rollNo: get("rollno") || undefined,
        batch: get("batch") || undefined,
      });
      const dob = normalizeDob(get("dob"));
      if (!parsed.success) return errors.push({ row: line, error: "Invalid email/name/field" });
      if (!dob) return errors.push({ row: line, error: "DOB must be YYYY-MM-DD" });
      const { email, name, rollNo, batch } = parsed.data;
      if (seen.has(email)) return errors.push({ row: line, error: "Duplicate email in file" });
      if (rollNo && seenRoll.has(rollNo.toLowerCase())) return errors.push({ row: line, error: "Duplicate roll no in file" });
      seen.add(email);
      if (rollNo) seenRoll.add(rollNo.toLowerCase());
      valid.push({ email, name, rollNo: rollNo ?? null, batch: batch ?? null, dobHash: hashDob(dob, pepper) });
    });

    const result = await db.student.createMany({ data: valid, skipDuplicates: true });
    await audit(`admin:${admin.userId}`, "student.import", { created: result.count, rejected: errors.length });
    return NextResponse.json({
      created: result.count,
      skippedExisting: valid.length - result.count,
      errors: errors.slice(0, 100),
    });
  } catch (e) {
    return handleError(e);
  }
}
