"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Empty, Panel, SkeletonRows, formatDate } from "@/components/admin";
import { ErrorText } from "@/components/ui";
import { percent } from "@/lib/student-summary";

interface Row {
  id: string;
  title: string;
  status: "SUBMITTED" | "EXPIRED" | "IN_PROGRESS";
  submittedAt: string | null;
  released: boolean;
  score: number | null;
  totalMarks: number | null;
}

const bar = (p: number) => (p >= 70 ? "bg-emerald-500" : p >= 40 ? "bg-amber-500" : "bg-red-500");

export function ResultsHistory() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: Row[] }>("GET", "/api/student/results").then((res) => {
      if (!res.ok) return setError(errorMessage(res));
      setRows(res.data.items);
    });
  }, []);

  if (error) return <ErrorText message={error} />;
  if (!rows) return <Panel><SkeletonRows rows={4} /></Panel>;
  if (rows.length === 0) return <Empty title="No results yet" text="Once you finish a test, your score will be listed here." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const p = r.released ? percent(r.score, r.totalMarks ?? 0) : null;
          return (
            <li key={r.id} className="stg-i" style={{ "--i": Math.min(rows.indexOf(r), 10) } as CSSProperties}>
              <Link href={`/result/${r.id}`} className="group flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:bg-brand-50/50">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium text-slate-900">{r.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">Submitted {formatDate(r.submittedAt)}</p>
                </div>
                {r.status === "EXPIRED" && <Badge tone="amber">Time ran out</Badge>}
                {r.released && r.score !== null && p !== null ? (
                  <div className="w-44 shrink-0">
                    <div className="flex justify-between font-mono text-sm">
                      <span className="font-semibold text-slate-900">{r.score}/{r.totalMarks}</span>
                      <span className="text-slate-500">{p}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`bar-grow h-full rounded-full ${bar(p)}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                ) : (
                  <Badge>Result pending</Badge>
                )}
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
