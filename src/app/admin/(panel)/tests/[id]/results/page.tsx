"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpDown, BarChart3, ChevronRight, Download, Medal, RefreshCw, Search, Send, Trophy } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Avatar, Badge, Button, ConfirmButton, Empty, LinkButton, PageHeader, Panel, Select, Skeleton, SkeletonCards, SkeletonRows, Spinner, formatDate } from "@/components/admin";
import { CountUp } from "@/components/motion";
import { useToast } from "@/components/Toast";
import { ErrorText, Segmented } from "@/components/ui";

interface Row {
  rank: number;
  attemptId: string;
  name: string;
  email: string;
  rollNo: string | null;
  batch: string | null;
  score: number;
  totalMarks: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  status: "SUBMITTED" | "EXPIRED";
  submittedAt: string | null;
  timeTakenSec: number | null;
}
interface Person {
  studentId: string;
  name: string;
  email: string;
  rollNo: string | null;
  batch: string | null;
  attemptId?: string;
}
interface Data {
  test: { id: string; title: string; status: string; totalMarks: number; questionCount: number; holdResults: boolean; resultsReleasedAt: string | null };
  rows: Row[];
  notStarted: Person[];
  inProgress: Person[];
  stats: { attempts: number; average: number; median: number; highest: number; lowest: number; passRate: number; passPercent: number } | null;
  distribution: number[];
  questionStats: { order: number; text: string; correctPct: number; wrongPct: number; skippedPct: number }[];
}
interface Detail {
  status: string;
  startedAt: string;
  submittedAt: string | null;
  questions: { id: string; text: string; options: string[]; correctOption: number | null; selectedOption: number | null; order: number }[];
}

type Tab = "results" | "notStarted" | "inProgress";
type SortKey = "rank" | "name" | "score" | "time";

const LETTERS = "ABCDEF";
const mins = (s: number | null) => (s === null ? "-" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("results");
  const [q, setQ] = useState("");
  const [batch, setBatch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const toast = useToast();

  const load = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      const res = await api<Data>("GET", `/api/admin/tests/${id}/results`);
      setLoading(false);
      setRefreshing(false);
      if (!res.ok) return setError(res.status === 404 ? "This test no longer exists." : errorMessage(res));
      setError("");
      setData(res.data);
    },
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  const batches = useMemo(() => Array.from(new Set([...(data?.rows ?? []), ...(data?.notStarted ?? [])].map((r) => r.batch).filter(Boolean) as string[])).sort(), [data]);

  const matches = useCallback(
    (p: { name: string; email: string; rollNo: string | null; batch: string | null }) => {
      const t = q.trim().toLowerCase();
      return (!batch || p.batch === batch) && (!t || p.name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t) || (p.rollNo ?? "").toLowerCase().includes(t));
    },
    [q, batch],
  );

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter(matches);
    const v = (r: Row) => (sort.key === "rank" ? r.rank : sort.key === "name" ? r.name.toLowerCase() : sort.key === "score" ? r.score : r.timeTakenSec ?? Infinity);
    return list.sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * sort.dir);
  }, [data, matches, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "score" ? -1 : 1 }));
  }

  async function release() {
    setReleasing(true);
    const res = await api("POST", `/api/admin/tests/${id}/release`);
    setReleasing(false);
    if (res.ok) {
      toast("Results released. Students can now see their scores.");
      load();
    } else {
      toast(errorMessage(res), "error");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <SkeletonCards count={4} />
        <Panel>
          <SkeletonRows rows={5} />
        </Panel>
      </div>
    );
  }
  if (!data) return <div className="space-y-3"><ErrorText message={error || "Not found."} /><Link href="/admin/tests" className="text-sm text-brand-600 hover:underline">Back to tests</Link></div>;

  const { test, stats } = data;
  const heldBack = test.holdResults && !test.resultsReleasedAt;
  const maxBucket = Math.max(1, ...data.distribution);

  return (
    <>
      <PageHeader
        back={{ href: `/admin/tests/${test.id}`, label: "Back to test" }}
        icon={BarChart3}
        title={`Results: ${test.title}`}
        subtitle={`${test.questionCount} questions, ${test.totalMarks} marks`}
        action={
          <>
            <Button onClick={() => load(true)} busy={refreshing}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <LinkButton href={`/api/admin/tests/${test.id}/export`}>
              <Download className="h-4 w-4" /> Export CSV
            </LinkButton>
          </>
        }
      />

      {heldBack && (
        <Panel className="mb-6 border-amber-300 bg-gradient-to-r from-amber-50/70 to-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Results are on hold</p>
              <p className="text-sm text-slate-500">Students see &quot;result pending&quot; until you release them.</p>
            </div>
            <Button variant="primary" busy={releasing} onClick={release}><Send className="h-4 w-4" /> Release results</Button>
          </div>
        </Panel>
      )}
      <ErrorText message={error} />

      {!stats ? (
        <Empty title="No submissions yet" text={`${data.inProgress.length} in progress, ${data.notStarted.length} not started.`} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat i={0} label="Submitted" value={stats.attempts} />
            <Stat i={1} label="Average" value={stats.average} sub={`of ${test.totalMarks}`} />
            <Stat i={2} label="Median" value={stats.median} />
            <Stat i={3} label="Highest / lowest" text={`${stats.highest} / ${stats.lowest}`} />
            <Stat i={4} label={`Pass rate (≥${stats.passPercent}%)`} value={stats.passRate} suffix="%" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Panel index={2} title="Score distribution" description="Number of students by percentage band.">
              <div role="img" aria-label={`Score distribution: ${data.distribution.join(", ")} students per 10 percent band`} className="flex h-40 items-end gap-1.5">
                {data.distribution.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs text-slate-500">{n || ""}</span>
                    <div className="bar-rise w-full rounded-t bg-gradient-to-t from-brand-600 to-cyan-400 transition-[filter] hover:brightness-110" title={`${n} student${n === 1 ? "" : "s"}`} style={{ height: `${(n / maxBucket) * 100}%`, minHeight: n ? 4 : 0, "--i": i } as CSSProperties} />
                    <span className="text-[10px] text-slate-400">{i * 10}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-slate-400">Percentage (band start)</p>
            </Panel>

            <Panel index={3} title="Question accuracy" description="Hardest questions first. Green = correct, red = wrong, grey = skipped.">
              <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {[...data.questionStats].sort((a, b) => a.correctPct - b.correctPct).map((s, qi) => (
                  <li key={s.order}>
                    <div className="flex items-start justify-between gap-2 text-sm">
                      <span className="line-clamp-1"><span className="font-semibold text-slate-500">Q{s.order}</span> {s.text}</span>
                      <span className="shrink-0 font-medium">{s.correctPct}%</span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${s.correctPct}% correct, ${s.wrongPct}% wrong, ${s.skippedPct}% skipped`}>
                      <div className="bar-grow bg-emerald-500" style={{ width: `${s.correctPct}%`, "--i": qi } as CSSProperties} />
                      <div className="bar-grow bg-red-500" style={{ width: `${s.wrongPct}%`, "--i": qi } as CSSProperties} />
                      <div className="bar-grow bg-slate-300" style={{ width: `${s.skippedPct}%`, "--i": qi } as CSSProperties} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <Panel index={4} className="mt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-auto sm:min-w-[26rem]">
            <Segmented value={tab} onChange={setTab} options={[{ value: "results", label: `Results (${data.rows.length})` }, { value: "notStarted", label: `Not attempted (${data.notStarted.length})` }, { value: "inProgress", label: `In progress (${data.inProgress.length})` }]} />
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input-base h-10 pl-9" placeholder="Search name, email, roll no" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </div>
          {batches.length > 0 && (
            <Select className="w-auto" value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Filter by batch">
              <option value="">All batches</option>
              {batches.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          )}
        </div>

        {tab === "results" && (
          rows.length === 0 ? <Empty title={data.rows.length ? "No students match your filters" : "No submissions yet"} /> : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[760px]">
                <thead>
                  <tr>
                    <Th onClick={() => toggleSort("rank")}>Rank</Th>
                    <Th onClick={() => toggleSort("name")}>Student</Th>
                    <th>Batch</th>
                    <Th onClick={() => toggleSort("score")}>Score</Th>
                    <th>C / W / S</th>
                    <Th onClick={() => toggleSort("time")}>Time</Th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <Fragment key={r.attemptId}>
                      <tr onClick={() => setOpen(open === r.attemptId ? null : r.attemptId)} className="cursor-pointer" style={{ "--i": Math.min(i, 14) } as CSSProperties}>
                        <td><RankBadge rank={r.rank} /></td>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={r.name} size={32} />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900">{r.name}</div>
                              <div className="truncate text-xs text-slate-500">{r.rollNo ? `${r.rollNo} · ` : ""}{r.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{r.batch ? <Badge tone="blue">{r.batch}</Badge> : "-"}</td>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="font-mono"><span className="font-semibold text-slate-900">{r.score}</span><span className="text-slate-400"> / {r.totalMarks}</span></span>
                            <Badge tone={r.percentage >= 60 ? "green" : r.percentage >= 40 ? "amber" : "red"}>{r.percentage}%</Badge>
                          </div>
                        </td>
                        <td className="font-mono text-xs text-slate-600">{r.correct} / {r.wrong} / {r.skipped}</td>
                        <td>{mins(r.timeTakenSec)} {r.status === "EXPIRED" && <Badge tone="amber">auto</Badge>}</td>
                        <td className="text-slate-500">{formatDate(r.submittedAt)}</td>
                        <td className="text-slate-400"><ChevronRight className={`h-4 w-4 transition-transform duration-300 ${open === r.attemptId ? "rotate-90 text-brand-600" : ""}`} /></td>
                      </tr>
                      {open === r.attemptId && (
                        <tr style={{ animation: "none" }}>
                          <td colSpan={8} className="!bg-slate-50/80 !p-4">
                            <div className="slide-down">
                              <AttemptDetail attemptId={r.attemptId} onReset={() => { setOpen(null); load(); }} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab !== "results" && (
          <PeopleList people={(tab === "notStarted" ? data.notStarted : data.inProgress).filter(matches)} inProgress={tab === "inProgress"} onChanged={load} />
        )}
      </Panel>
    </>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th>
      <button onClick={onClick} className="inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-brand-600">
        {children}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) return <span className="flex h-8 w-8 items-center justify-center font-mono text-sm font-semibold text-slate-500">{rank}</span>;
  const tone = ["from-amber-400 to-yellow-300 text-amber-950", "from-slate-300 to-slate-200 text-slate-700", "from-orange-400 to-amber-300 text-orange-950"][rank - 1];
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ${tone}`} title={`Rank ${rank}`}>
      {rank === 1 ? <Trophy className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
    </span>
  );
}

function Stat({ label, value, text, sub, suffix, i = 0 }: { label: string; value?: number; text?: string; sub?: string; suffix?: string; i?: number }) {
  return (
    <div className="stg-i card-hover rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ "--i": i } as CSSProperties}>
      <p className="label-mono text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900">
        {value !== undefined ? <CountUp value={value} suffix={suffix} /> : text}
        {sub && <span className="ml-1 font-sans text-sm font-normal text-slate-400">{sub}</span>}
      </p>
    </div>
  );
}

function PeopleList({ people, inProgress, onChanged }: { people: Person[]; inProgress: boolean; onChanged: () => void }) {
  const [err, setErr] = useState("");
  const toast = useToast();
  if (people.length === 0) return <Empty title={inProgress ? "Nobody is taking this test right now" : "Everyone assigned has attempted this test"} />;
  async function reset(attemptId: string) {
    const res = await api("POST", `/api/admin/attempts/${attemptId}/reset`);
    if (!res.ok) return setErr(errorMessage(res));
    toast("Attempt reset. The student can start again.");
    onChanged();
  }
  return (
    <>
      <ErrorText message={err} />
      <ul className="divide-y divide-slate-100 text-sm">
        {people.map((p) => (
          <li key={p.studentId} className="stg-i flex items-center justify-between gap-3 py-2.5" style={{ "--i": 0 } as CSSProperties}>
            <div className="flex items-center gap-3"><Avatar name={p.name} size={32} /><div><span className="font-medium">{p.name}</span> <span className="text-xs text-slate-500">{p.rollNo ? `${p.rollNo} · ` : ""}{p.email}</span></div></div>
            <div className="flex items-center gap-2">{p.batch && <Badge tone="blue">{p.batch}</Badge>}{inProgress && p.attemptId && <ConfirmButton label="Reset" confirmLabel="Reset attempt?" onConfirm={() => reset(p.attemptId!)} />}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

function AttemptDetail({ attemptId, onReset }: { attemptId: string; onReset: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Detail>("GET", `/api/admin/attempts/${attemptId}`).then((res) => (res.ok ? setD(res.data) : setError(errorMessage(res))));
  }, [attemptId]);

  async function reset() {
    const res = await api("POST", `/api/admin/attempts/${attemptId}/reset`);
    if (!res.ok) return setError(errorMessage(res));
    onReset();
  }

  if (error) return <ErrorText message={error} />;
  if (!d) return <Spinner label="Loading answers..." />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">Started {formatDate(d.startedAt)}{d.submittedAt ? `, submitted ${formatDate(d.submittedAt)}` : ""}</p>
        <ConfirmButton label="Reset so they can retake" confirmLabel="Delete this attempt?" onConfirm={reset} />
      </div>
      <ol className="space-y-2">
        {d.questions.map((q, i) => {
          const ok = q.selectedOption !== null && q.selectedOption === q.correctOption;
          return (
            <li key={q.id} className={`stg-i rounded-lg border p-3 text-sm ${q.selectedOption === null ? "border-slate-200 bg-white" : ok ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`} style={{ "--i": Math.min(i, 8) } as CSSProperties}>
              <div className="flex items-start justify-between gap-2">
                <p><span className="font-semibold text-slate-500">Q{i + 1}</span> {q.text}</p>
                {q.selectedOption === null ? <Badge>Skipped</Badge> : ok ? <Badge tone="green">Correct</Badge> : <Badge tone="red">Wrong</Badge>}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Chosen: <strong>{q.selectedOption === null ? "none" : `${LETTERS[q.selectedOption]}. ${q.options[q.selectedOption]}`}</strong>
                {!ok && q.correctOption !== null && <> · Correct: <strong>{LETTERS[q.correctOption]}. {q.options[q.correctOption]}</strong></>}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
