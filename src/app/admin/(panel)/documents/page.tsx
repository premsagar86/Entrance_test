"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, FileText, FileUp, Sparkles } from "lucide-react";
import { api, errorMessage, uploadFile } from "@/lib/client-api";
import { Badge, Button, Empty, PageHeader, Panel, SkeletonRows, formatDate } from "@/components/admin";
import { useToast } from "@/components/Toast";
import { ErrorText } from "@/components/ui";

interface Doc {
  id: string;
  filename: string;
  status: "UPLOADED" | "PARSING" | "PARSED" | "FAILED";
  createdAt: string;
  tests: { id: string; status: string; _count: { questions: number } }[];
}
interface UploadResult {
  testId: string;
  method: "template" | "ai";
  questions: number;
  missingKeys: number;
  lowConfidence: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /\.(pdf|docx|xlsx|txt|csv|png|jpe?g)$/i;
const STATUS_TONE = { UPLOADED: "gray", PARSING: "amber", PARSED: "green", FAILED: "red" } as const;

export default function DocumentsPage() {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ items: Doc[] }>("GET", "/api/admin/documents");
    setLoading(false);
    if (res.ok) setDocs(res.data.items);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function handle(file: File | undefined) {
    setError("");
    setResult(null);
    if (!file) return;
    if (!ALLOWED.test(file.name)) return setError("Allowed types: PDF, DOCX, XLSX, TXT, CSV, PNG, JPG.");
    if (file.size === 0) return setError("That file is empty.");
    if (file.size > MAX_BYTES) return setError("File is larger than 10 MB.");
    setBusy(true);
    const res = await uploadFile<UploadResult>("/api/admin/documents", file);
    setBusy(false);
    load();
    if (!res.ok) return setError(errorMessage(res, "Could not read this document."));
    setResult(res.data);
    toast(`Found ${res.data.questions} question${res.data.questions === 1 ? "" : "s"} in ${file.name}.`);
  }

  return (
    <>
      <PageHeader title="Documents" icon={FileUp} subtitle="Upload a question paper. Questions are extracted into a draft test you can review before publishing." />

      <Panel>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.xlsx,.txt,.csv,.png,.jpg,.jpeg"
          onChange={(e) => {
            handle(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handle(e.dataTransfer.files?.[0]);
          }}
          className={`relative overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition duration-300 ${
            dragging ? "dz-drag scale-[1.01] border-brand-500 bg-brand-50" : "border-slate-300 bg-gradient-to-b from-white to-slate-50 hover:border-brand-300"
          }`}
        >
          <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-[0_12px_28px_-10px_rgba(37,99,235,0.8)] ${busy ? "" : dragging ? "" : "lp-float"}`}>
            {busy ? <Sparkles className="h-7 w-7 animate-pulse" /> : <FileUp className="h-7 w-7" />}
          </span>
          <p className="mt-4 text-lg font-semibold text-slate-900">{busy ? "Reading your document..." : dragging ? "Drop it here" : "Drag a file here, or choose one"}</p>
          <p className="mt-1 text-sm text-slate-500">PDF, DOCX, XLSX, TXT, CSV, PNG or JPG. Up to 10 MB.</p>
          {busy ? (
            <div className="indeterminate mx-auto mt-5 h-1.5 w-56 rounded-full bg-slate-200" />
          ) : (
            <Button className="mt-5" variant="primary" onClick={() => input.current?.click()}>
              Choose file
            </Button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <ErrorText message={error} />
          {result && (
            <div className="slide-down rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 text-sm text-emerald-900">
              <p className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Found {result.questions} question{result.questions === 1 ? "" : "s"} {result.method === "ai" ? "(AI-assisted, please review carefully)" : ""}.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.missingKeys > 0 && <li><Badge tone="amber">{result.missingKeys} without an answer key</Badge></li>}
                {result.lowConfidence > 0 && <li><Badge tone="amber">{result.lowConfidence} low confidence</Badge></li>}
                {result.missingKeys === 0 && result.lowConfidence === 0 && <li><Badge tone="green">Everything has an answer key</Badge></li>}
              </ul>
              {result.missingKeys > 0 && <p className="mt-2 text-xs text-emerald-800/80">Set the missing answers before publishing.</p>}
              <Link href={`/admin/tests/${result.testId}`} className="press mt-3 inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">
                Review questions
              </Link>
            </div>
          )}
        </div>
        <details className="group mt-4 text-sm text-slate-500">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> Supported layout
          </summary>
          <pre className="slide-down mt-2 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{`1. What is 2 + 2?
A) 3
B) 4
C) 5
D) 6
Answer: B
Explanation: Basic addition.`}</pre>
          <p className="mt-2">Spreadsheets: columns Question, A, B, C, D, Answer. Answer lines are optional.</p>
        </details>
      </Panel>

      <Panel icon={FileText} title="Uploaded documents" className="mt-6" index={1}>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : docs.length === 0 ? (
          <Empty icon={FileText} title="No documents yet" text="Uploaded papers will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl min-w-[560px]">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Questions</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {docs.map((d, i) => {
                  const t = d.tests[0];
                  return (
                    <tr key={d.id} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
                      <td className="max-w-[260px]">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FileText className="h-4 w-4" /></span>
                          <span className="truncate font-medium text-slate-900">{d.filename}</span>
                        </div>
                      </td>
                      <td><Badge tone={STATUS_TONE[d.status]} live={d.status === "PARSING"}>{d.status.toLowerCase()}</Badge></td>
                      <td className="font-mono text-slate-700">{t ? t._count.questions : "-"}</td>
                      <td className="text-slate-500">{formatDate(d.createdAt)}</td>
                      <td className="text-right">{t && <Link href={`/admin/tests/${t.id}`} className="font-medium text-brand-600 hover:underline">Review</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
