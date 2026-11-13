"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Clock, ListChecks, Lock, PlayCircle, Target, TimerReset, TrendingUp, type LucideIcon } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Empty, Panel, SkeletonCards, SkeletonRows, formatDate } from "@/components/admin";
import { CountUp } from "@/components/motion";
import { ErrorText } from "@/components/ui";
import { filterOf, percent, summarise, type Filter } from "@/lib/student-summary";

type State = "upcoming" | "open" | "closed" | "in_progress" | "submitted" | "expired";
interface Item {
  id: string;
  title: string;
  durationMin: number;
  questionCount: number;
  totalMarks: number;
  startAt: string | null;
  endAt: string | null;
  state: State;
  attemptId: string | null;
  resultVisible: boolean;
  score: number | null;
}

const LABEL: Record<State, { text: string; tone: "gray" | "green" | "amber" | "red" | "blue"; icon: LucideIcon; tile: string }> = {
  upcoming: { text: "Not open yet", tone: "gray", icon: CalendarClock, tile: "from-slate-500 to-slate-400" },
  open: { text: "Available", tone: "green", icon: PlayCircle, tile: "from-emerald-600 to-teal-400" },
  closed: { text: "Closed", tone: "red", icon: Lock, tile: "from-red-600 to-rose-400" },
  in_progress: { text: "In progress", tone: "amber", icon: TimerReset, tile: "from-amber-500 to-orange-400" },
  submitted: { text: "Completed", tone: "blue", icon: CheckCircle2, tile: "from-brand-600 to-cyan-500" },
  expired: { text: "Time ran out", tone: "amber", icon: TimerReset, tile: "from-amber-500 to-orange-400" },
};

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "other", label: "Upcoming / closed" },
];

const btn = "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition";
const note = "rounded-lg bg-slate-100 px-3 py-2 text-center text-sm text-slate-600";

function numeric(v: string): number | null {
  const n = Number(v.replace("%", ""));
  return v !== "-" && Number.isFinite(n) ? n : null;
}

function bandColor(p: number) {
  return p >= 70 ? "bg-emerald-500" : p >= 40 ? "bg-amber-500" : "bg-red-500";
}

function Action({ t }: { t: Item }) {
  if (t.state === "open") return <Link href={`/test/${t.id}`} className={`${btn} bg-gradient-to-r from-brand-600 to-cyan-500 text-white shadow-sm hover:from-brand-700 hover:to-cyan-600`}>Start test <ArrowRight className="h-4 w-4" /></Link>;
  if (t.state === "in_progress") return <Link href={`/test/${t.id}`} className={`${btn} bg-amber-500 text-white shadow-sm hover:bg-amber-600`}>Continue test <ArrowRight className="h-4 w-4" /></Link>;
  if ((t.state === "submitted" || t.state === "expired") && t.attemptId) {
    return t.resultVisible ? (
      <Link href={`/result/${t.attemptId}`} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
        View result{t.score !== null ? ` · ${t.score}/${t.totalMarks}` : ""}
      </Link>
    ) : (
      <p className={note}>Result will be shared soon</p>
    );
  }
  if (t.state === "upcoming") return <p className={note}>Opens {formatDate(t.startAt)}</p>;
  return <p className={note}>This test is closed</p>;
}

function TestRow({ t, i }: { t: Item; i: number }) {
  const s = LABEL[t.state];
  const Icon = s.icon;
  return (
    <article className="stg-i card-hover flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center" style={{ "--i": Math.min(i, 10) } as CSSProperties}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${s.tile}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold leading-snug text-slate-900">{t.title}</h3>
          <Badge tone={s.tone} live={t.state === "in_progress" || t.state === "open"}>{s.text}</Badge>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {t.durationMin} min</span>
          <span className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> {t.questionCount} questions</span>
          <span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> {t.totalMarks} marks</span>
          {(t.startAt || t.endAt) && (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {t.startAt ? `Opens ${formatDate(t.startAt)}` : "Open now"}
              {t.endAt ? ` · closes ${formatDate(t.endAt)}` : ""}
            </span>
          )}
        </div>
      </div>
      <div className="sm:w-auto"><Action t={t} /></div>
    </article>
  );
}

export function StudentDashboard({ profile }: { profile: { name: string } }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api<{ items: Item[] }>("GET", "/api/student/tests").then((res) => {
      if (!res.ok) return setError(errorMessage(res));
      setItems(res.data.items);
    });
  }, []);

  const summary = useMemo(() => summarise(items ?? []), [items]);
  const first = profile.name.split(" ")[0];

  const focus = items?.find((t) => t.state === "in_progress") ?? items?.find((t) => t.state === "open");
  const shown = items?.filter((t) => filter === "all" || filterOf(t.state) === filter) ?? [];
  const results = (items ?? []).filter((t) => t.resultVisible && percent(t.score, t.totalMarks) !== null);

  const stats: { label: string; value: string; icon: LucideIcon; tile: string; card: string }[] = [
    { label: "Available", value: String(summary.counts.available), icon: PlayCircle, tile: "from-emerald-600 to-teal-400", card: "to-emerald-50/70" },
    { label: "In progress", value: String(summary.counts.in_progress), icon: TimerReset, tile: "from-amber-500 to-orange-400", card: "to-amber-50/70" },
    { label: "Completed", value: String(summary.counts.completed), icon: CheckCircle2, tile: "from-brand-600 to-cyan-500", card: "to-brand-50/70" },
    { label: "Average score", value: summary.averagePct === null ? "-" : `${summary.averagePct}%`, icon: TrendingUp, tile: "from-violet-600 to-indigo-500", card: "to-violet-50/70" },
  ];

  return (
    <div className="grid gap-6">
      <div className="min-w-0 space-y-6">
        {/* Welcome banner */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 p-6 text-white shadow-[0_8px_30px_-8px_rgba(37,99,235,0.5)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-white/70">Student dashboard</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome back, {first}</h1>
              <p className="mt-2 max-w-lg text-sm text-white/85">
                {items
                  ? summary.counts.in_progress
                    ? `You have a test in progress. Pick up where you left off.`
                    : summary.counts.available
                      ? `You have ${summary.counts.available} test${summary.counts.available > 1 ? "s" : ""} ready to take. Each test can be attempted once.`
                      : "No tests are open right now. Check back when your institute opens one."
                  : "Loading your tests..."}
              </p>
            </div>
            {focus && (
              <Link href={`/test/${focus.id}`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50">
                {focus.state === "in_progress" ? "Continue test" : "Start test"} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </section>

        {error && <ErrorText message={error} />}
        {!items && !error && (
          <div className="space-y-6">
            <SkeletonCards count={4} />
            <Panel>
              <SkeletonRows rows={3} />
            </Panel>
          </div>
        )}

        {items && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {stats.map(({ label, value, icon: Icon, tile, card }) => (
                <div key={label} className={`stg-i card-hover flex items-center gap-3 rounded-2xl border border-white bg-gradient-to-br from-white ${card} p-4 shadow-[0_2px_16px_-4px_rgba(37,99,235,0.15)]`} style={{ "--i": stats.findIndex((x) => x.label === label) } as CSSProperties}>
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${tile}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="label-mono truncate text-slate-500">{label}</p>
                    <p className="mt-0.5 font-mono text-2xl font-bold text-slate-900">{numeric(value) !== null ? <CountUp value={numeric(value) as number} suffix={value.endsWith("%") ? "%" : ""} /> : value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
              {/* Tests feed */}
              <section className="min-w-0">
                <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
                  {TABS.map(({ key, label }) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={filter === key}
                      onClick={() => setFilter(key)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        filter === key ? "bg-gradient-to-r from-brand-600 to-cyan-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                      <span className={`rounded-full px-1.5 font-mono text-xs ${filter === key ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{summary.counts[key]}</span>
                    </button>
                  ))}
                </div>
                {items.length === 0 ? (
                  <Empty title="No tests assigned yet" text="When your institute assigns a test, it will appear here with its time window and a Start button." />
                ) : shown.length === 0 ? (
                  <Empty title="Nothing here" text="No tests match this filter." />
                ) : (
                  <div className="space-y-3">{shown.map((t, i) => <TestRow key={t.id} t={t} i={i} />)}</div>
                )}
              </section>

              {/* Recent results */}
              <Panel index={3} title="Recent results" description="Scores for tests you've finished." className="h-fit">
                {results.length === 0 ? (
                  <p className="text-sm text-slate-500">Results will appear here after you finish a test.</p>
                ) : (
                  <ul className="space-y-4">
                    {results.map((t) => {
                      const p = percent(t.score, t.totalMarks) ?? 0;
                      return (
                        <li key={t.id}>
                          <Link href={`/result/${t.attemptId}`} className="group block">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-medium text-slate-900 group-hover:text-brand-600">{t.title}</span>
                              <span className="shrink-0 font-mono text-sm font-semibold text-slate-700">{t.score}/{t.totalMarks}</span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className={`bar-grow h-full rounded-full ${bandColor(p)}`} style={{ width: `${p}%` }} />
                            </div>
                            <p className="mt-1 font-mono text-xs text-slate-500">{p}%</p>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
