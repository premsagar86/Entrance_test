import Link from "next/link";
import { BookOpen, FileText, FileUp, Users, type LucideIcon } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Panel } from "@/components/admin";
import { CountUp } from "@/components/motion";
import { PASS_PERCENT } from "@/lib/results";

export const dynamic = "force-dynamic";

const DAYS = 14;

const ACCENTS = {
  violet: { tile: "from-violet-600 to-indigo-500", card: "to-violet-50/70", line: "#7c3aed" },
  blue: { tile: "from-brand-600 to-cyan-500", card: "to-brand-50/70", line: "#2563eb" },
  emerald: { tile: "from-emerald-600 to-teal-400", card: "to-emerald-50/70", line: "#059669" },
  amber: { tile: "from-amber-500 to-orange-400", card: "to-amber-50/70", line: "#d97706" },
} as const;

/** Local-day key used to bucket timestamps. */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Counts items per day over the window. */
function bucketByDay(dates: Date[], days: { key: string }[]): number[] {
  const counts = days.map(() => 0);
  const index = new Map(days.map((d, i) => [d.key, i]));
  for (const d of dates) {
    const i = index.get(dayKey(d));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}

function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtDateTime = (d: Date) => `${fmtDate(d)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

export default async function AdminHome() {
  const now = new Date();
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (DAYS - 1));

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    return { key: dayKey(d), label: fmtDate(d) };
  });

  const [students, tests, published, attempts, finished, recentAttempts, recentStudents, recentTests, live, upcoming] = await Promise.all([
    db.student.count(),
    db.test.count(),
    db.test.count({ where: { status: "PUBLISHED" } }),
    db.attempt.count({ where: { status: { not: "IN_PROGRESS" } } }),
    db.attempt.findMany({ where: { status: { not: "IN_PROGRESS" }, score: { not: null } }, select: { score: true, test: { select: { totalMarks: true } } } }),
    db.attempt.findMany({ where: { startedAt: { gte: since } }, select: { startedAt: true } }),
    db.student.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.test.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
    db.test.findMany({
      where: { status: "PUBLISHED", startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gt: now } }] },
      orderBy: { startAt: "desc" },
      take: 5,
      select: { id: true, title: true, endAt: true, _count: { select: { assignments: true } }, attempts: { where: { status: "IN_PROGRESS" }, select: { id: true } } },
    }),
    db.test.findMany({
      where: { status: "PUBLISHED", startAt: { gt: now } },
      orderBy: { startAt: "asc" },
      take: 5,
      select: { id: true, title: true, startAt: true, durationMin: true, _count: { select: { assignments: true } } },
    }),
  ]);

  // Pass rate and score distribution across all submitted attempts.
  const percents = finished
    .filter((a) => (a.test.totalMarks ?? 0) > 0)
    .map((a) => Math.max(0, Math.min(100, ((a.score ?? 0) / a.test.totalMarks) * 100)));
  const passed = percents.filter((p) => p >= PASS_PERCENT).length;
  const failed = percents.length - passed;
  const passRate = percents.length ? Math.round((passed / percents.length) * 100) : 0;
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const p of percents) buckets[Math.min(9, Math.floor(p / 10))]++;
  const maxBucket = Math.max(1, ...buckets);

  const attemptsPerDay = bucketByDay(recentAttempts.map((a) => a.startedAt), days);
  const studentsPerDay = bucketByDay(recentStudents.map((s) => s.createdAt), days);
  const testsPerDay = bucketByDay(recentTests.map((t) => t.createdAt), days);
  const publishedPerDay = bucketByDay(recentTests.filter((t) => t.status === "PUBLISHED").map((t) => t.createdAt), days);
  const attemptsInWindow = attemptsPerDay.reduce((s, n) => s + n, 0);
  const maxDay = Math.max(1, ...attemptsPerDay);

  const stats: { label: string; value: number; icon: LucideIcon; accent: keyof typeof ACCENTS; series: number[]; note: string }[] = [
    { label: "Students", value: students, icon: Users, accent: "violet", series: studentsPerDay, note: "added, last 14 days" },
    { label: "Tests", value: tests, icon: BookOpen, accent: "blue", series: testsPerDay, note: "created, last 14 days" },
    { label: "Published", value: published, icon: FileText, accent: "emerald", series: publishedPerDay, note: "published, last 14 days" },
    { label: "Submissions", value: attempts, icon: FileUp, accent: "amber", series: attemptsPerDay, note: "started, last 14 days" },
  ];

  // Attempts area chart geometry.
  const cw = 560;
  const ch = 220;
  const px = 8;
  const py = 14;
  const cstep = (cw - px * 2) / (DAYS - 1);
  const cpts = attemptsPerDay.map((v, i) => [px + i * cstep, ch - py - (v / maxDay) * (ch - py * 2)] as const);
  const cline = cpts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  return (
    <>
      <div className="relative">
        <PageHeader title="Dashboard" subtitle={`Overview for ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`} />
        <span className="absolute right-0 top-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-600">
          <span className="h-2 w-2 rounded-full bg-brand-500" /> Live
        </span>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, accent, series, note }, i) => {
          const total = series.reduce((s, n) => s + n, 0);
          return (
            <div key={label} className={`stg-i card-hover rounded-2xl border border-white bg-gradient-to-br from-white ${ACCENTS[accent].card} p-5 shadow-[0_2px_16px_-4px_rgba(37,99,235,0.15)]`} style={{ "--i": i } as React.CSSProperties}>
              <div className="flex items-center gap-4">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${ACCENTS[accent].tile}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="label-mono text-slate-500">{label}</p>
                  <p className="mt-1 font-mono text-3xl font-bold tracking-tight text-slate-900"><CountUp value={value} /></p>
                </div>
              </div>
              <div className="mt-4">
                <Sparkline values={series} color={ACCENTS[accent].line} label={`${label} trend, ${total} ${note}`} />
                <p className="mt-1 text-xs text-slate-500"><span className="font-semibold text-slate-700">{total}</span> {note}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trend + pass rate */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel index={4} title="Attempts, last 14 days" description={`${attemptsInWindow} tests started`} className="lg:col-span-2">
          <svg viewBox={`0 0 ${cw} ${ch}`} className="h-64 w-full" preserveAspectRatio="none" role="img" aria-label={`Attempts started per day: ${days.map((d, i) => `${d.label} ${attemptsPerDay[i]}`).join(", ")}`}>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={px} x2={cw - px} y1={py + (ch - py * 2) * f} y2={py + (ch - py * 2) * f} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={`${cline} L${cpts[DAYS - 1][0]} ${ch - py} L${cpts[0][0]} ${ch - py} Z`} fill="#2563eb" opacity="0.12" />
            <path d={cline} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {cpts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke">
                <title>{`${days[i].label}: ${attemptsPerDay[i]}`}</title>
              </circle>
            ))}
          </svg>
          <div className="mt-2 flex justify-between font-mono text-xs text-slate-400">
            <span>{days[0].label}</span>
            <span>peak {Math.max(...attemptsPerDay)} per day</span>
            <span>{days[DAYS - 1].label}</span>
          </div>
        </Panel>

        <Panel index={5} title="Pass rate" description={`Submissions scoring ${PASS_PERCENT}% or more`}>
          <div className="flex flex-col items-center gap-4 py-2">
            <svg viewBox="0 0 120 120" className="h-48 w-48" role="img" aria-label={`Pass rate ${passRate}%`}>
              <circle cx="60" cy="60" r="50" fill="none" strokeWidth="12" className="stroke-slate-100" />
              <circle cx="60" cy="60" r="50" fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-brand-600" pathLength={100} strokeDasharray={`${passRate} 100`} transform="rotate(-90 60 60)" />
              <text x="60" y="68" textAnchor="middle" className="fill-slate-900 font-mono text-[26px] font-bold">{passRate}%</text>
            </svg>
            <div className="grid w-full grid-cols-2 gap-3 text-center text-sm">
              <div className="rounded-xl bg-emerald-50 px-3 py-2"><p className="font-mono text-xl font-bold text-emerald-700">{passed}</p><p className="text-xs text-emerald-700/80">passed</p></div>
              <div className="rounded-xl bg-slate-100 px-3 py-2"><p className="font-mono text-xl font-bold text-slate-700">{failed}</p><p className="text-xs text-slate-500">did not pass</p></div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Distribution + live and upcoming */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel index={6} title="Score distribution" description={`Submissions by percentage score (${percents.length} scored)`} className="lg:col-span-2">
          {percents.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">No submissions yet.</p>
          ) : (
            <>
              <div className="flex h-64 items-end gap-2" role="img" aria-label={`Score distribution: ${buckets.map((n, i) => `${i * 10}-${i * 10 + 10}%: ${n}`).join(", ")}`}>
                {buckets.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${i * 10}-${i * 10 + 10}%: ${n}`}>
                    <span className="font-mono text-xs font-semibold text-slate-600">{n || ""}</span>
                    <div className={`w-full rounded-t-lg ${i * 10 >= PASS_PERCENT ? "bg-emerald-500" : "bg-slate-300"}`} style={{ height: `${Math.max(n ? 8 : 3, (n / maxBucket) * 200)}px`, opacity: n ? 1 : 0.4 }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 font-mono text-[11px] text-slate-400">
                {buckets.map((_, i) => (
                  <span key={i} className="flex-1 text-center">{i * 10}</span>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Pass ({PASS_PERCENT}%+)</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Below pass mark</span>
              </p>
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel index={7} title="Live now" description="Published tests whose window is open">
            {live.length === 0 ? (
              <p className="text-sm text-slate-500">No test is running right now.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {live.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/admin/tests/${t.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{t.title}</Link>
                      <p className="text-xs text-slate-500">{t.endAt ? `Closes ${fmtDateTime(t.endAt)}` : "No end time"} · {t._count.assignments} assigned</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{t.attempts.length} taking</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel index={8} title="Upcoming" description="Next scheduled tests" className="flex-1">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing scheduled. Publish a test with a start time to see it here.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((t) => (
                  <li key={t.id} className="py-2.5">
                    <Link href={`/admin/tests/${t.id}`} className="block truncate font-medium text-slate-900 hover:text-brand-600">{t.title}</Link>
                    <p className="text-xs text-slate-500">{t.startAt ? fmtDateTime(t.startAt) : ""} · {t.durationMin} min · {t._count.assignments} assigned</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
