"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Bookmark, CheckCircle2, Check, ChevronLeft, ChevronRight, Clock, CloudOff, Loader2, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Button, Spinner } from "@/components/admin";
import { Modal } from "@/components/Modal";
import { ErrorText, Logo } from "@/components/ui";

interface TestInfo {
  id: string;
  title: string;
  durationMin: number;
  questionCount: number;
  startAt: string | null;
  endAt: string | null;
  state: "upcoming" | "open" | "closed" | "in_progress" | "submitted" | "expired";
  attemptId: string | null;
}
interface RunQuestion {
  id: string;
  text: string;
  options: string[];
  marks: number;
}
interface StartResponse {
  attemptId: string;
  title: string;
  expiresAt: string;
  serverNow: number;
  questions: RunQuestion[];
  answers: Record<string, number | null>;
}

type Phase = "loading" | "intro" | "blocked" | "starting" | "running" | "submitting";
type SaveState = "saved" | "saving" | "unsaved" | "offline";

const LETTERS = "ABCDEF";
const AUTOSAVE_MS = 10_000;

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function TestRunner({ testId }: { testId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<TestInfo | null>(null);
  const [error, setError] = useState("");

  const [questions, setQuestions] = useState<RunQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [save, setSave] = useState<SaveState>("saved");
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const offset = useRef(0); // serverNow - clientNow, so the timer follows the server clock
  const pending = useRef(new Map<string, number | null>());
  const flushing = useRef(false);
  const autoSubmitted = useRef(false);
  const attemptRef = useRef("");
  const saveTimer = useRef<number>();

  // ---- load test info (decides which screen to show) ----
  useEffect(() => {
    api<{ items: TestInfo[] }>("GET", "/api/student/tests").then((res) => {
      if (!res.ok) {
        setError(errorMessage(res));
        return setPhase("blocked");
      }
      const t = res.data.items.find((x) => x.id === testId);
      if (!t) {
        setError("This test was not found, or it has not been assigned to you.");
        return setPhase("blocked");
      }
      setInfo(t);
      if ((t.state === "submitted" || t.state === "expired") && t.attemptId) return router.replace(`/result/${t.attemptId}`);
      if (t.state === "in_progress") return void begin();
      setPhase(t.state === "open" ? "intro" : "blocked");
      if (t.state === "upcoming") setError("This test has not opened yet.");
      if (t.state === "closed") setError("This test is closed.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  async function begin() {
    setPhase("starting");
    setError("");
    const res = await api<StartResponse>("POST", `/api/student/tests/${testId}/start`);
    if (!res.ok) {
      const finished = (res.data as { finished?: boolean; attemptId?: string }).finished;
      if (finished && (res.data as { attemptId?: string }).attemptId) return router.replace(`/result/${(res.data as { attemptId: string }).attemptId}`);
      setError(errorMessage(res, "Could not start the test."));
      return setPhase("blocked");
    }
    const d = res.data;
    offset.current = d.serverNow - Date.now();
    attemptRef.current = d.attemptId;
    setQuestions(d.questions);
    setAnswers(d.answers ?? {});
    setExpiresAt(new Date(d.expiresAt).getTime());
    setPhase("running");
  }

  // ---- autosave ----
  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current) return false;
    if (pending.current.size === 0) return true;
    flushing.current = true;
    setSave("saving");
    const batch = new Map(pending.current);
    const res = await api<{ expired?: boolean }>("PUT", `/api/student/attempts/${attemptRef.current}/answers`, {
      answers: Array.from(batch, ([questionId, selectedOption]) => ({ questionId, selectedOption })),
    });
    flushing.current = false;
    if (res.ok) {
      // Keep entries that changed again while this request was in flight.
      batch.forEach((v, k) => {
        if (pending.current.get(k) === v) pending.current.delete(k);
      });
      setSave(pending.current.size ? "unsaved" : "saved");
      return true;
    }
    if (res.status === 409) {
      router.replace(`/result/${attemptRef.current}`); // time is up or already submitted
      return false;
    }
    setSave(res.status === 0 ? "offline" : "unsaved");
    return false;
  }, [router]);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(flush, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [phase, flush]);

  // ---- submit ----
  const submit = useCallback(async () => {
    setSubmitError("");
    setPhase("submitting");
    // Retry the final save a few times so answers are not lost on a flaky connection.
    let saved = pending.current.size === 0;
    for (let i = 0; i < 3 && !saved; i++) {
      saved = await flush();
      if (!saved) await new Promise((r) => setTimeout(r, 800));
    }
    if (!saved && pending.current.size > 0 && !autoSubmitted.current) {
      setSubmitError("Your last answers could not be saved. Check your connection and try again.");
      setPhase("running");
      return;
    }
    const res = await api("POST", `/api/student/attempts/${attemptRef.current}/submit`);
    if (!res.ok) {
      setSubmitError(errorMessage(res, "Could not submit."));
      setPhase("running");
      return;
    }
    router.replace(`/result/${attemptRef.current}`);
  }, [flush, router]);

  // ---- timer ----
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = expiresAt - (Date.now() + offset.current);
      setRemaining(left);
      if (left <= 0 && !autoSubmitted.current) {
        autoSubmitted.current = true;
        submit();
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [phase, expiresAt, submit]);

  // ---- warn before leaving ----
  useEffect(() => {
    if (phase !== "running") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  // ---- integrity log: tab switches / window blur (best effort, never blocks the test) ----
  useEffect(() => {
    if (phase !== "running") return;
    const send = (type: "TAB_HIDDEN" | "TAB_VISIBLE" | "WINDOW_BLUR") => {
      if (!attemptRef.current) return;
      void api("POST", `/api/student/attempts/${attemptRef.current}/events`, { type });
    };
    const onVis = () => send(document.visibilityState === "hidden" ? "TAB_HIDDEN" : "TAB_VISIBLE");
    const onBlur = () => {
      if (document.visibilityState !== "hidden") send("WINDOW_BLUR");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
    };
  }, [phase]);

  function choose(qid: string, idx: number | null) {
    setAnswers((a) => ({ ...a, [qid]: idx }));
    pending.current.set(qid, idx);
    setSave("unsaved");
    // Save soon after a change, without waiting for the 10 s tick.
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 1500);
  }

  const answered = useMemo(() => questions.filter((q) => answers[q.id] !== null && answers[q.id] !== undefined).length, [questions, answers]);
  const q = questions[current];

  // ---------------- screens ----------------
  if (phase === "loading" || phase === "starting") return <Centered><Spinner label={phase === "starting" ? "Preparing your test..." : "Loading..."} /></Centered>;

  if (phase === "blocked") {
    return (
      <Centered>
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <ErrorText message={error || "This test is not available."} />
          <Link href="/dashboard" className="inline-block text-sm font-medium text-brand-600 hover:underline">Back to my tests</Link>
        </div>
      </Centered>
    );
  }

  if (phase === "intro" && info) {
    return (
      <Centered>
        <div className="w-full max-w-lg rounded-3xl border border-white bg-white/90 p-6 shadow-[0_30px_80px_-30px_rgba(37,99,235,0.5)] backdrop-blur sm:p-8">
          <Logo />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">{info.title}</h1>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="stg-i rounded-xl bg-gradient-to-br from-brand-50 to-white p-3 ring-1 ring-brand-100" style={{ "--i": 1 } as React.CSSProperties}><dt className="text-slate-500">Duration</dt><dd className="mt-0.5 font-mono text-lg font-bold">{info.durationMin} min</dd></div>
            <div className="stg-i rounded-xl bg-gradient-to-br from-cyan-50 to-white p-3 ring-1 ring-cyan-100" style={{ "--i": 2 } as React.CSSProperties}><dt className="text-slate-500">Questions</dt><dd className="mt-0.5 font-mono text-lg font-bold">{info.questionCount}</dd></div>
          </dl>
          <h2 className="mt-6 text-sm font-semibold">Before you begin</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>You can attempt this test <strong>only once</strong>. The timer starts as soon as you press Start.</li>
            <li>Your answers save automatically. If you refresh or lose connection, reopen the test to continue with the time left.</li>
            <li>Use the question palette to jump between questions and mark ones to review.</li>
            <li>The test submits automatically when time runs out.</li>
            {info.endAt && <li>This test closes at {new Date(info.endAt).toLocaleString()}; your time is capped by that.</li>}
          </ul>
          <div className="mt-7 flex gap-3">
            <Button variant="primary" className="flex-1" onClick={begin}>Start test</Button>
            <Link href="/dashboard" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50">Not now</Link>
          </div>
        </div>
      </Centered>
    );
  }

  if (!q) return <Centered><Spinner /></Centered>;

  const low = remaining <= 5 * 60_000;
  const warn = remaining <= 15 * 60_000;
  const unanswered = questions.length - answered;

  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <p className="truncate text-sm font-semibold">{info?.title}</p>
          <div className="flex items-center gap-3">
            <SaveBadge state={save} />
            <div
              role="timer"
              aria-live="off"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold transition-colors ${low ? "timer-low bg-red-100 text-red-700" : warn ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}
            >
              <Clock className="h-4 w-4" /> {fmt(remaining)}
            </div>
          </div>
        </div>
        <div className="h-1 bg-slate-100"><div className="h-full rounded-r-full bg-gradient-to-r from-brand-600 to-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)] transition-all duration-500 ease-out" style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
      </header>

      {warn && (
        <div role="status" className={`slide-down px-4 py-2 text-center text-sm font-medium ${low ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"}`}>
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          {low ? "Less than 5 minutes left. The test will submit automatically at zero." : "Less than 15 minutes left."}
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_300px]">
        <main>
          <div key={q.id} className="app-in rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_6px_30px_-12px_rgba(37,99,235,0.25)] sm:p-7">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-600">Question {current + 1} of {questions.length}</span>
              <span>{q.marks} mark{q.marks > 1 ? "s" : ""}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-lg font-medium leading-relaxed">{q.text}</p>
            <div role="radiogroup" aria-label="Options" className="mt-5 space-y-2.5">
              {q.options.map((o, i) => {
                const on = answers[q.id] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(q.id, i)}
                    className={`press stg-i flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${on ? "border-brand-600 bg-gradient-to-r from-brand-50 to-cyan-50/60 shadow-[0_6px_20px_-10px_rgba(37,99,235,0.6)]" : "border-slate-300 hover:-translate-y-px hover:border-brand-300 hover:bg-slate-50"}`}
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${on ? "bg-gradient-to-br from-brand-600 to-cyan-500 text-white" : "bg-slate-100 text-slate-600"}`}>{on ? <Check className="anim-pop h-3.5 w-3.5" /> : LETTERS[i]}</span>
                    <span className="pt-0.5">{o}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {answers[q.id] !== null && answers[q.id] !== undefined && <Button small variant="ghost" onClick={() => choose(q.id, null)}>Clear answer</Button>}
              <Button small variant="ghost" onClick={() => setMarked((m) => { const n = new Set(m); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}>
                <Bookmark className={`h-3.5 w-3.5 ${marked.has(q.id) ? "fill-amber-400 text-amber-500" : ""}`} /> {marked.has(q.id) ? "Unmark review" : "Mark for review"}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
            {current < questions.length - 1 ? (
              <Button variant="primary" onClick={() => setCurrent((c) => c + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button variant="primary" onClick={() => setConfirming(true)}><Send className="h-4 w-4" /> Review and submit</Button>
            )}
          </div>
        </main>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_6px_30px_-12px_rgba(37,99,235,0.25)]">
            <p className="text-sm font-semibold">Question palette</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {questions.map((x, i) => {
                const done = answers[x.id] !== null && answers[x.id] !== undefined;
                return (
                  <button
                    key={x.id}
                    onClick={() => setCurrent(i)}
                    aria-label={`Question ${i + 1}${done ? ", answered" : ""}${marked.has(x.id) ? ", marked for review" : ""}`}
                    aria-current={i === current}
                    className={`press relative h-9 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-110 ${done ? "bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"} ${i === current ? "scale-105 ring-2 ring-brand-500 ring-offset-2 ring-offset-white" : ""}`}
                  >
                    {i + 1}
                    {marked.has(x.id) && <span className="anim-pop absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-500">
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded bg-brand-600" />Answered ({answered})</p>
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded bg-slate-300" />Not answered ({unanswered})</p>
              <p><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />Marked for review ({marked.size})</p>
            </div>
            <Button variant="primary" className="mt-4 w-full" onClick={() => setConfirming(true)}>Submit test</Button>
          </div>
        </aside>
      </div>

      <Modal open={confirming || phase === "submitting"} onClose={() => { setConfirming(false); setSubmitError(""); }} dismissible={phase !== "submitting"} label="Submit test">
        <h2 className="text-lg font-semibold">Submit your test?</h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> {answered} answered</li>
          <li className={`flex items-center gap-2 ${unanswered ? "font-medium text-amber-700" : ""}`}><AlertTriangle className="h-4 w-4" /> {unanswered} not answered</li>
          {marked.size > 0 && <li className="flex items-center gap-2"><Bookmark className="h-4 w-4 text-amber-500" /> {marked.size} marked for review</li>}
        </ul>
        <p className="mt-3 text-sm text-slate-500">You cannot change your answers after submitting.</p>
        <div className="mt-3"><ErrorText message={submitError} /></div>
        <div className="mt-5 flex gap-3">
          <Button variant="primary" className="flex-1" busy={phase === "submitting"} onClick={submit}>Yes, submit</Button>
          <Button data-autofocus disabled={phase === "submitting"} onClick={() => { setConfirming(false); setSubmitError(""); }}>Go back</Button>
        </div>
      </Modal>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-app p-4"><div className="app-in w-full flex justify-center">{children}</div></div>;
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="hidden items-center gap-1 text-xs text-slate-500 sm:flex"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving</span>;
  if (state === "offline") return <span className="flex items-center gap-1 text-xs font-medium text-red-600"><CloudOff className="h-3.5 w-3.5" /> Offline, will retry</span>;
  if (state === "unsaved") return <span className="hidden text-xs text-slate-500 sm:block">Unsaved changes</span>;
  return <span className="hidden items-center gap-1 text-xs text-emerald-600 sm:flex"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>;
}
