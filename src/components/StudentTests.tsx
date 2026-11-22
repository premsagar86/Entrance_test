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
    <article className="stg-i card-hover relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 pl-5 shadow-sm sm:flex-row sm:items-center" style={{ "--i": Math.min(i, 10) } as CSSProperties}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${STRIPE[t.state]}`} />
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

function Ring({ pct, size = 88 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label={`${pct}% of tests completed`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

const STRIPE: Record<State, string> = {
  upcoming: "bg-slate-300",
  open: "bg-emerald-500",
  closed: "bg-red-400",
  in_progress: "bg-amber-500",
  submitted: "bg-brand-500",
  expired: "bg-amber-400",
};

export function StudentDashboard({ profile }: { profile: { name: string; rollNo?: string | null; batch?: string | null } }) {
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
  const initials = profile.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const donePct = Math.round(summary.completedRatio * 100);

  const focus = items?.find((t) => t.state === "in_progress") ?? items?.find((t) => t.state === "open");
  const shown = items?.filter((t) => filter === "all" || filterOf(t.state) === filter) ?? [];
  const results = (items ?? []).filter((t) => t.resultVisible && percent(t.score, t.totalMarks) !== null);

  const stats: { label: string; value: string; icon: LucideIcon; color: string }[] = [
    { label: "Available", value: String(summary.counts.available), icon: PlayCircle, color: "text-emerald-600 bg-emerald-50" },
    { label: "In progress", value: String(summary.counts.in_progress), icon: TimerReset, color: "text-amber-600 bg-amber-50" },
    { label: "Completed", value: String(summary.counts.completed), icon: CheckCircle2, color: "text-brand-600 bg-brand-50" },
    { label: "Average score", value: summary.averagePct === null ? "-" : `${summary.averagePct}%`, icon: TrendingUp, color: "text-violet-600 bg-violet-50" },
  ];

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 p-6 text-white shadow-[0_12px_40px_-12px_rgba(37,99,235,0.6)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-lg font-bold ring-1 ring-white/30 backdrop-blur">{initials || "S"}</span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">Hi, {first}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                {profile.batch && <span className="rounded-full bg-white/20 px-2.5 py-1 ring-1 ring-white/25">Batch {profile.batch}</span>}
                {profile.rollNo && <span className="rounded-full bg-white/20 px-2.5 py-1 font-mono ring-1 ring-white/25">Roll {profile.rollNo}</span>}
              </div>
            </div>
          </div>
          {items && items.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <Ring pct={donePct} />
                <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold">{donePct}%</span>
              </div>
              <div className="text-sm text-white/85">
                <p className="font-semibold text-white">Progress</p>
                <p>{summary.counts.completed} of {items.length} tests done</p>
              </div>
            </div>
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
          {/* Up next */}
          {focus ? (
            <section className="stg-i flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-white p-5 shadow-sm">
              <div className="min-w-0">
                <p className="label-mono text-brand-600">{focus.state === "in_progress" ? "Pick up where you left off" : "Up next"}</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">{focus.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {focus.durationMin} min · {focus.questionCount} questions · {focus.totalMarks} marks{focus.endAt ? ` · closes ${formatDate(focus.endAt)}` : ""}
                </p>
              </div>
              <Link href={`/test/${focus.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-cyan-600">
                {focus.state === "in_progress" ? "Continue test" : "Start test"} <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          ) : (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4 text-sm text-slate-500">No tests are open right now. Check back when your institute opens one.</p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, color }, idx) => (
              <div key={label} className="stg-i flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ "--i": idx } as CSSProperties}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-xl font-bold leading-none text-slate-900">{numeric(value) !== null ? <CountUp value={numeric(value) as number} suffix={value.endsWith("%") ? "%" : ""} /> : value}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{label}</p>
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
  );
}
