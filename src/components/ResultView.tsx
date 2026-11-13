"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, MinusCircle, PartyPopper, XCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Panel, Skeleton, formatDate } from "@/components/admin";
import { CountUp } from "@/components/motion";
import { ErrorText } from "@/components/ui";

interface ReviewItem {
  id: string;
  text: string;
  options: string[];
  correctOption: number | null;
  explanation: string | null;
  marks: number;
  selectedOption: number | null;
}
interface Result {
  testTitle: string;
  status: "SUBMITTED" | "EXPIRED";
  submittedAt: string | null;
  released: boolean;
  score?: number;
  totalMarks?: number;
  percentage?: number;
  correct?: number;
  wrong?: number;
  unanswered?: number;
  review?: ReviewItem[];
}

const LETTERS = "ABCDEF";

export function ResultView({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    api<Result>("GET", `/api/student/attempts/${attemptId}/result`).then((res) => {
      if (!res.ok) return setError(res.status === 404 ? "We could not find this result." : res.status === 409 ? "This test is still in progress." : errorMessage(res));
      setData(res.data);
    });
  }, [attemptId]);

  // Draw the ring on the next frame so the stroke animates from empty.
  useEffect(() => {
    if (!data) return;
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [data]);

  const back = (
    <Link href="/results" className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
      <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Back to my results
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorText message={error} />
        {back}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-56" />
        <Panel>
          <div className="flex items-center gap-8">
            <Skeleton className="h-36 w-36 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-40" />
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  if (!data.released) {
    return (
      <div className="space-y-4">
        {back}
        <Panel className="border-amber-200 bg-gradient-to-r from-amber-50/70 to-white">
          <div className="flex items-start gap-4">
            <span className="lp-float flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <Clock className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{data.testTitle}</h1>
              <p className="mt-1 text-sm text-slate-600">Your test was submitted on {formatDate(data.submittedAt)}. Your result has not been released yet. Please check back later.</p>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  const pct = data.percentage ?? 0;
  const tone = pct >= 60 ? "green" : pct >= 40 ? "amber" : "red";
  const ring = tone === "green" ? "stroke-emerald-500" : tone === "amber" ? "stroke-amber-500" : "stroke-red-500";
  const great = pct >= 70;

  return (
    <div className="space-y-6">
      {back}
      <Panel className={great ? "overflow-hidden border-emerald-200" : ""}>
        {great && <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />}
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{data.testTitle}</h1>
          {data.status === "EXPIRED" && <Badge tone="amber">Auto-submitted when time ran out</Badge>}
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-8">
          <div role="img" aria-label={`${pct}%`} className="relative h-36 w-36">
            <svg viewBox="0 0 36 36" className="h-36 w-36 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" className="stroke-slate-100" />
              <circle
                cx="18"
                cy="18"
                r="15.9"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${drawn ? Math.min(100, pct) : 0} 100`}
                className={`${ring} transition-[stroke-dasharray] duration-[1400ms] ease-out motion-reduce:transition-none`}
                style={{ filter: great ? "drop-shadow(0 0 3px rgb(16 185 129 / 0.6))" : undefined }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-3xl font-bold text-slate-900">
                <CountUp value={pct} suffix="%" duration={1300} />
              </span>
            </div>
          </div>
          <div>
            <p className="label-mono text-slate-500">Your score</p>
            <p className="mt-1 font-mono text-5xl font-bold tracking-tight text-slate-900">
              <CountUp value={data.score ?? 0} />
              <span className="text-2xl text-slate-400"> / {data.totalMarks}</span>
            </p>
            {great && (
              <p className="anim-pop mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                <PartyPopper className="h-4 w-4" /> Great work!
              </p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center text-sm">
            <Stat i={0} icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Correct" value={data.correct ?? 0} tone="bg-emerald-50" />
            <Stat i={1} icon={<XCircle className="h-5 w-5 text-red-500" />} label="Wrong" value={data.wrong ?? 0} tone="bg-red-50" />
            <Stat i={2} icon={<MinusCircle className="h-5 w-5 text-slate-400" />} label="Skipped" value={data.unanswered ?? 0} tone="bg-slate-50" />
          </dl>
        </div>
      </Panel>

      {data.review && (
        <Panel index={1} title="Review your answers">
          <ol className="space-y-4">
            {data.review.map((q, i) => {
              const ok = q.selectedOption !== null && q.selectedOption === q.correctOption;
              return (
                <li key={q.id} className={`stg-i rounded-xl border p-4 ${q.selectedOption === null ? "border-slate-200" : ok ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`} style={{ "--i": Math.min(i, 10) } as CSSProperties}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-slate-500">Q{i + 1}</span>
                    {q.selectedOption === null ? <Badge>Skipped</Badge> : ok ? <Badge tone="green">Correct</Badge> : <Badge tone="red">Wrong</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap font-medium text-slate-900">{q.text}</p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {q.options.map((o, j) => {
                      const isCorrect = q.correctOption === j;
                      const isPicked = q.selectedOption === j;
                      return (
                        <li key={j} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${isCorrect ? "bg-emerald-100/70 text-emerald-900 ring-1 ring-emerald-200" : isPicked ? "bg-red-100/70 text-red-900 ring-1 ring-red-200" : "bg-white/70"}`}>
                          <span className="font-semibold">{LETTERS[j]}.</span>
                          <span>{o}</span>
                          <span className="ml-auto flex items-center gap-1 text-xs font-medium">
                            {isCorrect ? <><CheckCircle2 className="h-3.5 w-3.5" /> Correct answer</> : isPicked ? <><XCircle className="h-3.5 w-3.5" /> Your answer</> : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-600">{q.explanation}</p>}
                </li>
              );
            })}
          </ol>
        </Panel>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone, i }: { icon: React.ReactNode; label: string; value: number; tone: string; i: number }) {
  return (
    <div className={`stg-i rounded-xl px-4 py-3 ${tone}`} style={{ "--i": i + 2 } as CSSProperties}>
      <div className="flex justify-center">{icon}</div>
      <dd className="mt-1 font-mono text-xl font-bold text-slate-900">
        <CountUp value={value} />
      </dd>
      <dt className="text-xs text-slate-500">{label}</dt>
    </div>
  );
}
