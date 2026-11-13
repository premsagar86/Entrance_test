"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarClock, Clock, ListChecks, Plus, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Button, Empty, FieldError, PageHeader, Panel, SkeletonRows, formatDate, fromLocalInput } from "@/components/admin";
import { Expand } from "@/components/motion";
import { ErrorText, Field } from "@/components/ui";

interface TestRow {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  durationMin: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  _count: { questions: number; assignments: number; attempts: number };
}

const TONE = { DRAFT: "gray", PUBLISHED: "green", CLOSED: "amber" } as const;
const TILE = { DRAFT: "from-slate-500 to-slate-400", PUBLISHED: "from-emerald-600 to-teal-400", CLOSED: "from-amber-500 to-orange-400" } as const;

export default function TestsPage() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: TestRow[] }>("GET", "/api/admin/tests");
    setLoading(false);
    if (!res.ok) return setError(errorMessage(res));
    setTests(res.data.items);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Tests"
        icon={BookOpen}
        subtitle="Create a test manually, or upload a document to generate one."
        action={
          <Button variant="primary" onClick={() => setCreating((c) => !c)}>
            <Plus className={`h-4 w-4 transition-transform duration-300 ${creating ? "rotate-45" : ""}`} /> {creating ? "Close form" : "New test"}
          </Button>
        }
      />
      <Expand open={creating}>
        <div className="pb-6">
          <CreateTest onCancel={() => setCreating(false)} />
        </div>
      </Expand>

      <ErrorText message={error} />
      {loading ? (
        <Panel>
          <SkeletonRows rows={4} />
        </Panel>
      ) : tests.length === 0 ? (
        <Empty icon={BookOpen} title="No tests yet" text="Create one here or upload a document." action={<Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New test</Button>} />
      ) : (
        <div className="space-y-3">
          {tests.map((t, i) => (
            <Link
              key={t.id}
              href={`/admin/tests/${t.id}`}
              className="stg-i card-hover group flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              style={{ "--i": Math.min(i, 10) } as CSSProperties}
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${TILE[t.status]}`}>
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-600">{t.title}</h3>
                  <Badge tone={TONE[t.status]} live={t.status === "PUBLISHED"}>
                    {t.status.toLowerCase()}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> {t._count.questions} questions</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {t.durationMin} min</span>
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {t._count.assignments} assigned</span>
                  <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> {t.startAt ? `${formatDate(t.startAt)} - ${formatDate(t.endAt)}` : "Anytime"}</span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-brand-600" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function CreateTest({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ title: "", durationMin: "60", startAt: "", endAt: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    const dur = Number(f.durationMin);
    if (!f.title.trim()) v.title = "Title is required.";
    if (!Number.isInteger(dur) || dur < 1 || dur > 600) v.durationMin = "Enter a whole number of minutes between 1 and 600.";
    if (f.startAt && f.endAt && new Date(f.endAt) <= new Date(f.startAt)) v.endAt = "End must be after the start.";
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const res = await api<{ id: string }>("POST", "/api/admin/tests", {
      title: f.title.trim(),
      durationMin: dur,
      startAt: fromLocalInput(f.startAt),
      endAt: fromLocalInput(f.endAt),
    });
    setBusy(false);
    if (!res.ok) return setServerError(errorMessage(res));
    router.push(`/admin/tests/${res.data.id}`);
  }

  return (
    <Panel icon={Plus} title="New test">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Field label="Title" value={f.title} onChange={set("title")} maxLength={200} />
          <FieldError message={errors.title} />
        </div>
        <div>
          <Field label="Duration (minutes)" type="number" min={1} max={600} value={f.durationMin} onChange={set("durationMin")} />
          <FieldError message={errors.durationMin} />
        </div>
        <div />
        <div>
          <Field label="Opens (optional)" type="datetime-local" value={f.startAt} onChange={set("startAt")} />
        </div>
        <div>
          <Field label="Closes (optional)" type="datetime-local" value={f.endAt} onChange={set("endAt")} />
          <FieldError message={errors.endAt} />
        </div>
        <div className="space-y-3 sm:col-span-2">
          <ErrorText message={serverError} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" busy={busy}>
              Create and add questions
            </Button>
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  );
}
