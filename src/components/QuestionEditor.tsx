"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Button, ConfirmButton, FieldError, Textarea } from "@/components/admin";
import { useToast } from "@/components/Toast";
import { ErrorText } from "@/components/ui";

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctOption: number | null;
  marks: number;
  explanation: string | null;
  order: number;
  confidence: number | null;
}

const LETTERS = "ABCDEF";

export function QuestionCard({ q, index, editable, onChanged }: { q: Question; index: number; editable: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<number | null>(q.correctOption);
  useEffect(() => setKey(q.correctOption), [q.correctOption]);
  const noKey = key === null || key >= q.options.length;
  const low = (q.confidence ?? 1) < 0.6;
  const brokenOptions = q.options.some((o) => !o.trim());

  async function remove() {
    setBusy(true);
    const res = await api("DELETE", `/api/admin/questions/${q.id}`);
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res));
    toast(`Question ${index + 1} deleted.`);
    onChanged();
  }

  async function setAnswer(i: number) {
    if (i === key) return;
    const previous = key;
    setKey(i); // optimistic
    const res = await api("PATCH", `/api/admin/questions/${q.id}`, { correctOption: i });
    if (!res.ok) {
      setKey(previous);
      return toast(errorMessage(res), "error");
    }
    toast(`Answer key saved for question ${index + 1}.`);
    onChanged();
  }

  if (editing) {
    return (
      <QuestionForm
        initial={q}
        title={`Edit question ${index + 1}`}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <div className={`card-hover rounded-xl border bg-white p-4 ${noKey || brokenOptions ? "border-amber-300 bg-amber-50/30" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-500">Q{index + 1}</span>
          {noKey && <Badge tone="amber">No answer key</Badge>}
          {low && <Badge tone="red">Low confidence</Badge>}
          {brokenOptions && <Badge tone="red">Options missing</Badge>}
          <Badge>{q.marks} mark{q.marks > 1 ? "s" : ""}</Badge>
        </div>
        {editable && (
          <div className="flex gap-1">
            <Button small variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
            <ConfirmButton label={<Trash2 className="h-3.5 w-3.5" />} confirmLabel="Delete?" busy={busy} onConfirm={remove} />
          </div>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap font-medium">{q.text}</p>
      {editable && noKey && <p className="mt-3 text-xs font-medium text-amber-700">Click the correct option to set the answer key.</p>}
      <ul className="mt-3 space-y-1.5 text-sm">
        {q.options.map((o, i) => {
          const isKey = key === i;
          const inner = (
            <>
              <span className="font-semibold">{LETTERS[i]}.</span>
              <span className="text-left">{o || <em className="text-red-600">empty</em>}</span>
              {isKey ? (
                <span className="anim-pop ml-auto inline-flex items-center gap-1 text-xs font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Correct</span>
              ) : (
                editable && <span className="ml-auto hidden text-xs font-medium text-brand-600 group-hover/opt:inline">Set as answer</span>
              )}
            </>
          );
          const tone = isKey ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-slate-50";
          return (
            <li key={i}>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setAnswer(i)}
                  aria-pressed={isKey}
                  aria-label={`Set option ${LETTERS[i]} as the correct answer`}
                  className={`group/opt press flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${tone} ${isKey ? "" : "hover:bg-brand-50 hover:ring-1 hover:ring-brand-200"}`}
                >
                  {inner}
                </button>
              ) : (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${tone}`}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {q.explanation && <p className="mt-3 text-sm text-slate-500">Explanation: {q.explanation}</p>}
      <div className="mt-2"><ErrorText message={error} /></div>
    </div>
  );
}

/** Create (no `initial`) or edit a question, with client-side validation mirroring the API. */
export function QuestionForm({ testId, initial, title, onSaved, onCancel }: { testId?: string; initial?: Question; title: string; onSaved: () => void; onCancel: () => void }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options?.length ? initial.options : ["", "", "", ""]);
  const [correct, setCorrect] = useState<number | null>(initial?.correctOption ?? null);
  const [marks, setMarks] = useState(String(initial?.marks ?? 1));
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  const setOpt = (i: number, v: string) => setOptions(options.map((o, j) => (j === i ? v : o)));
  function removeOpt(i: number) {
    setOptions(options.filter((_, j) => j !== i));
    setCorrect((c) => (c === null ? null : c === i ? null : c > i ? c - 1 : c));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    const trimmed = options.map((o) => o.trim());
    const m = Number(marks);
    if (!text.trim()) v.text = "Question text is required.";
    else if (text.length > 4000) v.text = "Question is too long (max 4000 characters).";
    if (trimmed.some((o) => !o)) v.options = "Fill in every option, or remove the empty ones.";
    else if (new Set(trimmed.map((o) => o.toLowerCase())).size !== trimmed.length) v.options = "Options must be different from each other.";
    else if (trimmed.some((o) => o.length > 500)) v.options = "An option is too long (max 500 characters).";
    if (!Number.isInteger(m) || m < 1 || m > 100) v.marks = "Marks must be a whole number from 1 to 100.";
    setErrors(v);
    if (Object.keys(v).length) return;

    setBusy(true);
    const body = { text: text.trim(), options: trimmed, correctOption: correct, marks: m, explanation: explanation.trim() || null };
    const res = initial
      ? await api("PATCH", `/api/admin/questions/${initial.id}`, body)
      : await api("POST", "/api/admin/questions", { ...body, testId, explanation: body.explanation ?? undefined });
    setBusy(false);
    if (!res.ok) return setServerError(errorMessage(res));
    onSaved();
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4 rounded-xl border border-brand-300 bg-white p-4 shadow-[0_0_0_4px_rgba(37,99,235,0.06)]">
      <h3 className="font-semibold">{title}</h3>
      <Textarea label="Question" rows={3} value={text} onChange={(e) => setText(e.target.value)} error={errors.text} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Answer key: choose the correct option</legend>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-sm font-semibold text-slate-500">{LETTERS[i]}</span>
              <input className={`input-base h-10 ${correct === i ? "border-emerald-400 bg-emerald-50/50" : ""}`} value={o} onChange={(e) => setOpt(i, e.target.value)} aria-label={`Option ${LETTERS[i]}`} />
              <button
                type="button"
                aria-pressed={correct === i}
                onClick={() => setCorrect(correct === i ? null : i)}
                className={`press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 ${correct === i ? "bg-emerald-500 text-white shadow-sm" : "border border-slate-300 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"}`}
              >
                {correct === i ? <><CheckCircle2 className="anim-pop h-3.5 w-3.5" /> Correct answer</> : "Set as answer"}
              </button>
              {options.length > 2 && <Button type="button" small variant="ghost" onClick={() => removeOpt(i)} aria-label="Remove option"><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          ))}
        </div>
        <FieldError message={errors.options} />
        <div className="mt-2 flex items-center gap-3">
          {options.length < 6 && <Button type="button" small onClick={() => setOptions([...options, ""])}><Plus className="h-3.5 w-3.5" /> Add option</Button>}
          {correct !== null && <Button type="button" small variant="ghost" onClick={() => setCorrect(null)}>Clear answer</Button>}
        </div>
        {correct === null && <p className="mt-2 text-xs text-amber-700">No answer selected. The test cannot be published until every question has one.</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Marks</span>
          <input className="input-base h-10" type="number" min={1} max={100} value={marks} onChange={(e) => setMarks(e.target.value)} />
          <FieldError message={errors.marks} />
        </label>
        <Textarea label="Explanation (optional)" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>
      <ErrorText message={serverError} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={busy}>Save question</Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
