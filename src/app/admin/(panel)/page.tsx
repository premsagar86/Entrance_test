import Link from "next/link";
import { BookOpen, FileText, FileUp, Users, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Panel } from "@/components/admin";
import { CountUp } from "@/components/motion";

export const dynamic = "force-dynamic";

const ACCENTS = {
  violet: { tile: "from-violet-600 to-indigo-500", card: "to-violet-50/70" },
  blue: { tile: "from-brand-600 to-cyan-500", card: "to-brand-50/70" },
  emerald: { tile: "from-emerald-600 to-teal-400", card: "to-emerald-50/70" },
  amber: { tile: "from-amber-500 to-orange-400", card: "to-amber-50/70" },
} as const;

export default async function AdminHome() {
  const [students, tests, published, drafts, attempts] = await Promise.all([
    db.student.count(),
    db.test.count(),
    db.test.count({ where: { status: "PUBLISHED" } }),
    db.test.count({ where: { status: "DRAFT" } }),
    db.attempt.count({ where: { status: { not: "IN_PROGRESS" } } }),
  ]);

  const stats: { label: string; value: number; icon: LucideIcon; accent: keyof typeof ACCENTS }[] = [
    { label: "Students", value: students, icon: Users, accent: "violet" },
    { label: "Tests", value: tests, icon: BookOpen, accent: "blue" },
    { label: "Published", value: published, icon: FileText, accent: "emerald" },
    { label: "Submissions", value: attempts, icon: FileUp, accent: "amber" },
  ];

  const steps = [
    { href: "/admin/students", title: "Add students", text: "Import a CSV of email, name, date of birth and roll number." },
    { href: "/admin/documents", title: "Upload questions", text: "Upload a PDF, DOCX, XLSX or TXT. Questions are extracted into a draft test." },
    { href: "/admin/tests", title: "Review and publish", text: `Fix answer keys, then publish.${drafts ? ` ${drafts} draft${drafts > 1 ? "s" : ""} waiting.` : ""}` },
  ];

  return (
    <>
      <div className="relative">
        <PageHeader title="Dashboard" subtitle="Welcome back! Here's what's happening today." />
        <span className="absolute right-0 top-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-600">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> Live
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className={`stg-i card-hover flex items-center gap-4 rounded-2xl border border-white bg-gradient-to-br from-white ${ACCENTS[accent].card} p-5 shadow-[0_2px_16px_-4px_rgba(37,99,235,0.15)]`} style={{ "--i": stats.findIndex((x) => x.label === label) } as React.CSSProperties}>
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${ACCENTS[accent].tile}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="label-mono text-slate-500">{label}</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-slate-900"><CountUp value={value} /></p>
            </div>
          </div>
        ))}
      </div>
      <Panel index={4} title="Getting started" className="mt-6">
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <Link key={s.href} href={s.href} className="stg-i card-hover group rounded-xl border border-slate-200 bg-white p-4" style={{ "--i": i + 4 } as React.CSSProperties}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 font-mono text-xs font-bold text-brand-600 transition group-hover:bg-brand-100">{i + 1}</span>
              <p className="mt-3 font-medium text-slate-900">{s.title}</p>
              <p className="mt-1 text-sm text-slate-500">{s.text}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </>
  );
}
