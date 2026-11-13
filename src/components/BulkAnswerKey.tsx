"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, FileUp, KeyRound, Wand2 } from "lucide-react";
import { api, errorMessage, uploadFile } from "@/lib/client-api";
import { Badge, Button } from "@/components/admin";
import { Expand } from "@/components/motion";
import { useToast } from "@/components/Toast";
import { ErrorText } from "@/components/ui";
import { letter, parseAnswerKey, planAnswerKey } from "@/lib/answer-key";
import type { Question } from "@/components/QuestionEditor";

const ALLOWED = /\.(pdf|docx|xlsx|txt|csv)$/i;
const list = (nums: number[], max = 12) => (nums.length > max ? `${nums.slice(0, max).map((n) => `Q${n}`).join(", ")} and ${nums.length - max} more` : nums.map((n) => `Q${n}`).join(", "));

/** Paste an answer key (or read one from a document), preview how it maps to the questions, then apply it. */
export function BulkAnswerKey({ testId, questions, onDone }: { testId: string; questions: Question[]; onDone: () => void }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const parsed = useMemo(() => parseAnswerKey(text), [text]);
  const plan = useMemo(() => planAnswerKey(parsed.entries, questions), [parsed, questions]);
  const replacing = plan.assign.filter((a) => a.replaces !== null).length;
  const hasText = text.trim().length > 0;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setError("");
    if (!file) return;
    if (!ALLOWED.test(file.name)) return setError("Upload a PDF, Word, Excel, CSV or text file.");
    if (file.size > 10 * 1024 * 1024) return setError("File is larger than 10 MB.");
    setReading(true);
    const res = await uploadFile<{ text: string }>(`/api/admin/tests/${testId}/answer-key`, file);
    setReading(false);
    if (!res.ok) return setError(errorMessage(res, "Could not read that file."));
    setText(res.data.text);
    const found = parseAnswerKey(res.data.text).entries.length;
    toast(found > 0 ? `Read ${found} answer${found === 1 ? "" : "s"} from ${file.name}. Check the preview, then apply.` : `No answers were recognised in ${file.name}.`, found > 0 ? "success" : "error");
  }

  async function apply() {
    setError("");
    setApplying(true);
    const res = await api<{ applied: number }>("PUT", `/api/admin/tests/${testId}/answer-key`, { entries: plan.assign.map((a) => ({ n: a.n, option: a.option })) });
    setApplying(false);
    if (!res.ok) return setError(errorMessage(res));
    toast(`${res.data.applied} answer key${res.data.applied === 1 ? "" : "s"} saved.`);
    setText("");
    if (plan.missing.length === 0) setOpen(false);
    onDone();
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50/60 to-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-sm">
            <KeyRound className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Bulk answer key</span>
            <span className="block text-xs text-slate-500">Paste the answers for all questions at once, or upload them from a document.</span>
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      <Expand open={open}>
        <div className="space-y-4 border-t border-brand-100 px-4 py-4">
          <div>
            <label htmlFor="bulk-key" className="mb-1.5 block text-sm font-medium text-slate-700">
              Answer key
            </label>
            <textarea
              id="bulk-key"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"1-B, 2-D, 3-A, 4-C\nor one per line:\n1. B\n2. D"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Question numbers follow the order below (Q1 is the first question). Accepted styles: <code>1-B</code>, <code>1. b</code>, <code>1) C</code>, <code>Q4: A</code>, or just letters in order like <code>B D A C</code>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt" className="hidden" onChange={onFile} />
            <Button busy={reading} onClick={() => fileInput.current?.click()}>
              <FileUp className="h-4 w-4" /> Upload from document
            </Button>
            <span className="text-xs text-slate-500">PDF, Word, Excel, CSV or text with lines like &ldquo;1-B&rdquo;. You can review it before applying.</span>
          </div>

          {hasText && (
            <div className="slide-down space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Wand2 className="h-4 w-4 text-brand-600" />
                <span className="font-semibold text-slate-900">
                  {plan.assign.length === 0 ? "No usable answers recognised yet" : `${plan.assign.length} of ${questions.length} questions will get a key`}
                </span>
                {replacing > 0 && <Badge tone="amber">{replacing} existing {replacing === 1 ? "key" : "keys"} will change</Badge>}
              </div>

              {plan.assign.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Preview of answers to apply">
                  {plan.assign.map((a) => (
                    <li key={a.n} title={a.replaces !== null ? `Replaces ${letter(a.replaces)}` : undefined} className={`rounded-md px-2 py-1 font-mono text-xs font-semibold ${a.replaces !== null ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>
                      Q{a.n} &rarr; {letter(a.option)}
                    </li>
                  ))}
                </ul>
              )}

              <ul className="space-y-1 text-xs">
                {plan.missing.length > 0 && plan.assign.length > 0 && <li className="text-amber-700">No answer given for: {list(plan.missing)}.</li>}
                {plan.invalidOption.length > 0 && (
                  <li className="text-red-600">
                    Skipped, the letter does not exist on that question: {plan.invalidOption.map((x) => `Q${x.n} (${letter(x.option)}, only ${x.optionCount} options)`).slice(0, 8).join(", ")}.
                  </li>
                )}
                {plan.unknownQuestion.length > 0 && <li className="text-red-600">Skipped, this test has only {questions.length} questions: {list(plan.unknownQuestion)}.</li>}
                {parsed.duplicates.length > 0 && <li className="text-slate-500">Listed more than once, the first answer was used: {list(parsed.duplicates)}.</li>}
              </ul>
            </div>
          )}

          <ErrorText message={error} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={plan.assign.length === 0} busy={applying} onClick={apply}>
              <KeyRound className="h-4 w-4" /> Apply {plan.assign.length > 0 ? `${plan.assign.length} ` : ""}answer{plan.assign.length === 1 ? "" : "s"}
            </Button>
            {hasText && (
              <Button variant="ghost" onClick={() => setText("")}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Expand>
    </div>
  );
}
