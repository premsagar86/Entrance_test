import { z } from "zod";
import { NextResponse } from "next/server";
import { handleError, requireAdmin } from "@/lib/auth";
import { parseParam } from "@/lib/http";
import { loadTestResults } from "@/lib/results";
import { csvCell } from "@/lib/csv";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const id = parseParam(z.string().min(1).max(40), params.id);
    const data = await loadTestResults(id);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const header = ["Rank", "Name", "Email", "Roll No", "Batch", "Score", "Total", "Percentage", "Correct", "Wrong", "Skipped", "Status", "Submitted at", "Time taken (min)"];
    const lines = [header.join(",")];
    for (const r of data.rows) {
      lines.push(
        [r.rank, r.name, r.email, r.rollNo, r.batch, r.score, r.totalMarks, r.percentage, r.correct, r.wrong, r.skipped, r.status === "EXPIRED" ? "Auto-submitted" : "Submitted", r.submittedAt, r.timeTakenSec === null ? "" : (r.timeTakenSec / 60).toFixed(1)]
          .map(csvCell) // neutralises spreadsheet formula injection from names, etc.
          .join(","),
      );
    }
    for (const p of data.notStarted) lines.push(["", p.name, p.email, p.rollNo, p.batch, "", "", "", "", "", "", "Not attempted", "", ""].map(csvCell).join(","));

    await audit(`admin:${admin.userId}`, "results.export", { testId: id, rows: data.rows.length });
    const safeName = data.test.title.replace(/[^\w\- ]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "results";
    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${safeName}-results.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
