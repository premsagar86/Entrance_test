"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BarChart3, CheckCircle2, ListChecks, Plus, Send, Settings2, UserPlus } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Button, Empty, FieldError, LinkButton, PageHeader, Panel, Skeleton, SkeletonRows, Toggle, formatDate, fromLocalInput, toLocalInput } from "@/components/admin";
import { useToast } from "@/components/Toast";
import { ErrorText, Field, Segmented } from "@/components/ui";
import { QuestionCard, QuestionForm, type Question } from "@/components/QuestionEditor";
import { BulkAnswerKey } from "@/components/BulkAnswerKey";

interface TestDetail {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  durationMin: number;
  totalMarks: number;
  startAt: string | null;
  endAt: string | null;
  holdResults: boolean;
  showAnswers: boolean;
  _count: { questions: number; assignments: number; attempts: number };
}

const TONE = { DRAFT: "gray", PUBLISHED: "green", CLOSED: "amber" } as const;

function jumpTo(id: string | undefined) {
  if (!id) return;
  const el = document.getElementById(`q-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("key-flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("key-flash");
}

export default function TestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [t, qs] = await Promise.all([api<TestDetail>("GET", `/api/admin/tests/${id}`), api<{ items: Question[] }>("GET", `/api/admin/tests/${id}/questions`)]);
    setLoading(false);
    if (!t.ok) return setError(t.status === 404 ? "This test no longer exists." : errorMessage(t));
    setError("");
    setTest(t.data);
    if (qs.ok) setQuestions(qs.data.items);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      </div>
    );
  }
  if (!test) {
    return (
      <div className="space-y-3">
        <ErrorText message={error || "Not found."} />
        <Link href="/admin/tests" className="text-sm text-brand-600 hover:underline">
          Back to tests
        </Link>
      </div>
    );
  }

  const draft = test.status === "DRAFT";
  const missing = questions.filter((q) => q.correctOption === null || q.correctOption >= q.options.length || q.options.some((o) => !o.trim()));

  return (
    <>
      <PageHeader
        back={{ href: "/admin/tests", label: "All tests" }}
        title={test.title}
        subtitle={`${test._count.questions} questions, ${test.durationMin} min, ${test.totalMarks || questions.reduce((s, q) => s + q.marks, 0)} marks`}
        action={
          <>
            <Badge tone={TONE[test.status]} live={test.status === "PUBLISHED"}>
              {test.status.toLowerCase()}
            </Badge>
            {!draft && (
              <LinkButton href={`/admin/tests/${test.id}/results`} variant="primary">
                <BarChart3 className="h-4 w-4" /> View results ({test._count.attempts})
              </LinkButton>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {draft && <PublishPanel testId={test.id} count={questions.length} missing={missing.length} onDone={load} onJump={() => jumpTo(missing[0]?.id)} />}
        <SettingsPanel test={test} onSaved={load} />

        <Panel
          index={2}
          icon={ListChecks}
          title="Questions"
          description={draft ? "Click the correct option on each question to set its answer key. Anything flagged needs your attention." : "Published tests are locked, so questions and answer keys can no longer be changed. Create a new test to change them."}
        >
          {draft && questions.length > 0 && <BulkAnswerKey testId={test.id} questions={questions} onDone={load} />}
          <div className="space-y-3">
            {questions.length === 0 && !adding && <Empty icon={ListChecks} title="No questions yet" text="Add one below, or upload a document on the Documents page." />}
            {questions.map((q, i) => (
              <div key={q.id} id={`q-${q.id}`} className="stg-i scroll-mt-28 rounded-xl" style={{ "--i": Math.min(i, 10) } as React.CSSProperties}>
                <QuestionCard q={q} index={i} editable={draft} onChanged={load} />
              </div>
            ))}
            {adding && (
              <div className="slide-down">
                <QuestionForm
                  testId={test.id}
                  title="New question"
                  onCancel={() => setAdding(false)}
                  onSaved={() => {
                    setAdding(false);
                    load();
                  }}
                />
              </div>
            )}
          </div>
          {draft && !adding && (
            <Button className="mt-4" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add question
            </Button>
          )}
        </Panel>

        <AssignPanel testId={test.id} assigned={test._count.assignments} onDone={load} />
      </div>
    </>
  );
}

function PublishPanel({ testId, count, missing, onDone, onJump }: { testId: string; count: number; missing: number; onDone: () => void; onJump: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = count > 0 && missing === 0;

  async function publish() {
    setBusy(true);
    setError("");
    const res = await api<{ questionOrders?: number[] }>("POST", `/api/admin/tests/${testId}/publish`);
    setBusy(false);
    if (!res.ok) {
      const orders = res.data.questionOrders?.length ? ` Check question${res.data.questionOrders.length > 1 ? "s" : ""} ${res.data.questionOrders.join(", ")}.` : "";
      return setError(errorMessage(res) + orders);
    }
    toast("Test published. Assigned students can now see it.");
    onDone();
  }

  return (
    <Panel className={ready ? "border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-white" : "border-amber-200 bg-gradient-to-r from-amber-50/70 to-white"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${ready ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-slate-900">{ready ? "Ready to publish" : "Not ready to publish"}</p>
            <p className="text-sm text-slate-500">
              {count === 0 ? "Add at least one question." : missing > 0 ? `${missing} question${missing > 1 ? "s" : ""} need an answer key or have empty options.` : "Every question has an answer key. Publishing locks the questions and timing."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {missing > 0 && (
            <Button onClick={onJump}>Jump to first missing key</Button>
          )}
          <Button variant="primary" disabled={!ready} busy={busy} onClick={publish}>
            <Send className="h-4 w-4" /> Publish test
          </Button>
        </div>
      </div>
      <div className="mt-3">
        <ErrorText message={error} />
      </div>
    </Panel>
  );
}

function SettingsPanel({ test, onSaved }: { test: TestDetail; onSaved: () => void }) {
  const toast = useToast();
  const draft = test.status === "DRAFT";
  const [f, setF] = useState({ title: test.title, durationMin: String(test.durationMin), startAt: toLocalInput(test.startAt), endAt: toLocalInput(test.endAt), holdResults: test.holdResults, showAnswers: test.showAnswers });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    const dur = Number(f.durationMin);
    if (!f.title.trim()) v.title = "Title is required.";
    if (!Number.isInteger(dur) || dur < 1 || dur > 600) v.durationMin = "Enter minutes between 1 and 600.";
    if (f.startAt && f.endAt && new Date(f.endAt) <= new Date(f.startAt)) v.endAt = "End must be after the start.";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const res = await api("PATCH", `/api/admin/tests/${test.id}`, {
      title: f.title.trim(),
      ...(draft ? { durationMin: dur, startAt: fromLocalInput(f.startAt) ?? null } : {}),
      endAt: fromLocalInput(f.endAt) ?? null,
      holdResults: f.holdResults,
      showAnswers: f.showAnswers,
    });
    setBusy(false);
    if (res.ok) {
      toast("Settings saved.");
      onSaved();
    } else {
      toast(errorMessage(res), "error");
    }
  }

  return (
    <Panel index={1} icon={Settings2} title="Settings" description={draft ? undefined : `Duration and start time are locked after publishing. Opens ${formatDate(test.startAt)}.`}>
      <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} />
          <FieldError message={errors.title} />
        </div>
        <div>
          <Field label="Duration (minutes)" type="number" min={1} max={600} disabled={!draft} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} />
          <FieldError message={errors.durationMin} />
        </div>
        <div />
        <div>
          <Field label="Opens" type="datetime-local" disabled={!draft} value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} />
        </div>
        <div>
          <Field label="Closes" type="datetime-local" value={f.endAt} onChange={(e) => setF({ ...f, endAt: e.target.value })} />
          <FieldError message={errors.endAt} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <Toggle label="Show correct answers after submit" description="Otherwise students see only their score." checked={f.showAnswers} onChange={(v) => setF({ ...f, showAnswers: v })} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <Toggle label="Hold results until I release them" description="Off means instant results." checked={f.holdResults} onChange={(v) => setF({ ...f, holdResults: v })} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" busy={busy}>
            Save settings
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function AssignPanel({ testId, assigned, onDone }: { testId: string; assigned: number; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"all" | "batch">("all");
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);

  async function assign() {
    if (mode === "batch" && !batch.trim()) return toast("Enter a batch name.", "error");
    setBusy(true);
    const res = await api<{ assigned: number; matched: number }>("POST", `/api/admin/tests/${testId}/assign`, mode === "all" ? { all: true } : { batch: batch.trim() });
    setBusy(false);
    if (!res.ok) return toast(errorMessage(res), "error");
    toast(res.data.matched === 0 ? "No students matched." : `${res.data.assigned} newly assigned (${res.data.matched} matched).`, res.data.matched === 0 ? "error" : "success");
    onDone();
  }

  return (
    <Panel index={3} icon={UserPlus} title="Assign to students" description={`${assigned} student${assigned === 1 ? "" : "s"} currently assigned. Students only see published tests assigned to them.`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Segmented value={mode} onChange={setMode} options={[{ value: "all", label: "All students" }, { value: "batch", label: "A batch" }]} />
        </div>
        {mode === "batch" && (
          <div className="slide-down w-48">
            <input className="input-base h-10" placeholder="Batch name" aria-label="Batch name" value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={60} />
          </div>
        )}
        <Button variant="primary" busy={busy} onClick={assign}>
          Assign
        </Button>
      </div>
    </Panel>
  );
}
