"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Download, GraduationCap, Plus, Search, Upload, X } from "lucide-react";
import { api, errorMessage, postText } from "@/lib/client-api";
import { Avatar, Badge, Button, ConfirmButton, Empty, FieldError, PageHeader, Panel, SkeletonRows, formatDate } from "@/components/admin";
import { Expand } from "@/components/motion";
import { useToast } from "@/components/Toast";
import { ErrorText, Field, InfoText } from "@/components/ui";

interface Student {
  id: string;
  email: string;
  name: string;
  rollNo: string | null;
  batch: string | null;
  createdAt: string;
}
interface ImportResult {
  created: number;
  skippedExisting: number;
  errors: { row: number; error: string }[];
}

const PAGE_SIZE = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(f: { email: string; name: string; dob: string; rollNo: string }) {
  const e: Record<string, string> = {};
  if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address.";
  if (!f.name.trim()) e.name = "Name is required.";
  if (!f.dob) e.dob = "Date of birth is required.";
  else if (new Date(f.dob) > new Date()) e.dob = "Date of birth cannot be in the future.";
  if (f.rollNo.length > 40) e.rollNo = "Roll number is too long.";
  return e;
}

export default function StudentsPage() {
  const [items, setItems] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ items: Student[]; total: number }>("GET", `/api/admin/students?page=${page}&q=${encodeURIComponent(query)}`);
    setLoading(false);
    if (!res.ok) return setError(errorMessage(res));
    setError("");
    setItems(res.data.items);
    setTotal(res.data.total);
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQuery(q.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function remove(id: string) {
    const res = await api("DELETE", `/api/admin/students/${id}`);
    if (!res.ok) return toast(errorMessage(res), "error");
    toast("Student deleted.");
    load();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Students"
        icon={GraduationCap}
        subtitle={`${total} registered. Only registered students can sign in.`}
        action={
          <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
            <Plus className={`h-4 w-4 transition-transform duration-300 ${showForm ? "rotate-45" : ""}`} /> {showForm ? "Close form" : "Add student"}
          </Button>
        }
      />

      <Expand open={showForm}>
        <div className="pb-6">
          <AddStudent
            onDone={() => {
              setShowForm(false);
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      </Expand>
      <ImportPanel onDone={load} />

      <Panel className="mt-6" index={2}>
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input-base pl-10 pr-9" placeholder="Search name, email or roll no" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="modal-enter absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {error && (
          <div className="mb-4">
            <ErrorText message={error} />
          </div>
        )}
        {loading && items.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : items.length === 0 ? (
          <Empty icon={GraduationCap} title={query ? "No students match your search" : "No students yet"} text={query ? undefined : "Add a student or import a CSV to get started."} />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="tbl min-w-[680px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll no</th>
                  <th>Batch</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((s, i) => (
                  <tr key={s.id} className="group" style={{ "--i": Math.min(i, 12) } as CSSProperties}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{s.name}</p>
                          <p className="truncate text-xs text-slate-500">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs text-slate-600">{s.rollNo ?? <span className="text-slate-300">-</span>}</td>
                    <td>{s.batch ? <Badge tone="blue">{s.batch}</Badge> : <span className="text-slate-300">-</span>}</td>
                    <td className="text-slate-500">{formatDate(s.createdAt)}</td>
                    <td className="text-right opacity-60 transition-opacity group-hover:opacity-100">
                      <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={() => remove(s.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <Button small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button small disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

function AddStudent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ email: "", name: "", rollNo: "", dob: "", batch: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate(f);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const res = await api("POST", "/api/admin/students", {
      email: f.email.trim(),
      name: f.name.trim(),
      dob: f.dob,
      ...(f.rollNo.trim() ? { rollNo: f.rollNo.trim() } : {}),
      ...(f.batch.trim() ? { batch: f.batch.trim() } : {}),
    });
    setBusy(false);
    if (!res.ok) return setServerError(errorMessage(res));
    toast(`${f.name.trim()} was added.`);
    setF({ email: "", name: "", rollNo: "", dob: "", batch: "" });
    onDone();
  }

  return (
    <Panel icon={Plus} title="Add a student">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div>
          <Field label="Full name" value={f.name} onChange={set("name")} maxLength={120} />
          <FieldError message={errors.name} />
        </div>
        <div>
          <Field label="Email" type="email" value={f.email} onChange={set("email")} maxLength={254} />
          <FieldError message={errors.email} />
        </div>
        <div>
          <Field label="Date of birth" type="date" value={f.dob} onChange={set("dob")} max={new Date().toISOString().slice(0, 10)} />
          <FieldError message={errors.dob} />
        </div>
        <div>
          <Field label="Roll number (optional)" value={f.rollNo} onChange={set("rollNo")} maxLength={40} />
          <FieldError message={errors.rollNo} />
        </div>
        <div>
          <Field label="Batch (optional)" value={f.batch} onChange={set("batch")} maxLength={60} hint="Used to assign tests to a group." />
        </div>
        <div className="space-y-3 sm:col-span-2">
          <ErrorText message={serverError} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" busy={busy}>
              Save student
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

const TEMPLATE = "email,name,dob,rollNo,batch\nasha@example.com,Asha Verma,2006-04-18,2024-001,Batch A\n";

function ImportPanel({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setResult(null);
    setError("");
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setError("Please choose a .csv file.");
    if (file.size > 1_000_000) return setError("File is larger than 1 MB.");
    setBusy(true);
    const res = await postText<ImportResult>("/api/admin/students/import", await file.text());
    setBusy(false);
    if (!res.ok) return setError(errorMessage(res));
    setResult(res.data);
    toast(`Import finished: ${res.data.created} added, ${res.data.skippedExisting} skipped.`);
    onDone();
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel index={1} icon={Upload} title="Import from CSV" description="Columns: email, name, dob (YYYY-MM-DD), rollNo, batch. Up to 2000 rows. Existing emails are skipped.">
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        <Button busy={busy} onClick={() => input.current?.click()}>
          <Upload className="h-4 w-4" /> Choose CSV
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}>
          <Download className="h-4 w-4" /> Download template
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        <ErrorText message={error} />
        {result && (
          <div className="slide-down space-y-3">
            <InfoText message={`${result.created} added, ${result.skippedExisting} already existed${result.errors.length ? `, ${result.errors.length} rows rejected` : ""}.`} />
            {result.errors.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
                {result.errors.map((er) => (
                  <li key={er.row}>
                    Row {er.row}: {er.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
