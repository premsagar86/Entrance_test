"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AlertTriangle, Info, Megaphone, Pencil, Plus, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Button, ConfirmButton, Empty, FieldError, PageHeader, Panel, Select, SkeletonRows, Textarea, Toggle, formatDate, fromLocalInput, toLocalInput } from "@/components/admin";
import { useToast } from "@/components/Toast";
import { ErrorText, Field } from "@/components/ui";

type AnnType = "INFO" | "MAINTENANCE" | "WARNING" | "RELEASE_NOTE";
type Audience = "STUDENT" | "ADMIN" | "ALL";
type Status = "inactive" | "scheduled" | "live" | "expired";

interface Ann {
  id: string;
  title: string;
  body: string;
  type: AnnType;
  audience: Audience;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  status: Status;
}

const TYPE_LABEL: Record<AnnType, string> = { INFO: "Info", WARNING: "Warning", MAINTENANCE: "Maintenance", RELEASE_NOTE: "What's new" };
const AUDIENCE_LABEL: Record<Audience, string> = { ALL: "Everyone (incl. login page)", STUDENT: "Students", ADMIN: "Admins" };
const STATUS_TONE = { live: "green", scheduled: "blue", expired: "gray", inactive: "gray" } as const;
const TYPE_META: Record<AnnType, { icon: LucideIcon; tile: string; edge: string }> = {
  INFO: { icon: Info, tile: "from-brand-600 to-cyan-500", edge: "border-l-brand-500" },
  WARNING: { icon: AlertTriangle, tile: "from-amber-500 to-orange-400", edge: "border-l-amber-500" },
  MAINTENANCE: { icon: Wrench, tile: "from-red-600 to-rose-400", edge: "border-l-red-500" },
  RELEASE_NOTE: { icon: Sparkles, tile: "from-violet-600 to-indigo-500", edge: "border-l-violet-500" },
};

export default function AnnouncementsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Ann | "new" | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ items: Ann[] }>("GET", "/api/admin/announcements");
    setLoading(false);
    if (!res.ok) return setError(errorMessage(res));
    setError("");
    setItems(res.data.items);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Ann) {
    const res = await api("PATCH", `/api/admin/announcements/${a.id}`, { isActive: !a.isActive });
    if (!res.ok) return toast(errorMessage(res), "error");
    toast(a.isActive ? "Announcement disabled." : "Announcement enabled.");
    load();
  }
  async function remove(a: Ann) {
    const res = await api("DELETE", `/api/admin/announcements/${a.id}`);
    if (!res.ok) return toast(errorMessage(res), "error");
    toast("Announcement deleted.");
    load();
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        icon={Megaphone}
        subtitle="Show notices to students and admins, post release notes, or switch on maintenance mode."
        action={
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New announcement
          </Button>
        }
      />
      {editing && (
        <div className="slide-down mb-6">
          <AnnouncementForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              toast(editing === "new" ? "Announcement published." : "Changes saved.");
              setEditing(null);
              load();
            }}
          />
        </div>
      )}
      <ErrorText message={error} />
      {loading ? (
        <Panel>
          <SkeletonRows rows={3} />
        </Panel>
      ) : items.length === 0 ? (
        <Empty icon={Megaphone} title="No announcements yet" text="Create one to show a banner to students, such as 'Scheduled maintenance on Sunday'." action={<Button variant="primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New announcement</Button>} />
      ) : (
        <ul className="space-y-3">
          {items.map((a, i) => {
            const m = TYPE_META[a.type];
            const Icon = m.icon;
            return (
              <li key={a.id} className={`stg-i card-hover flex flex-wrap items-start gap-4 rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${m.edge} ${a.isActive ? "" : "opacity-70"}`} style={{ "--i": Math.min(i, 10) } as CSSProperties}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${m.tile}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{a.title}</span>
                    <Badge tone={STATUS_TONE[a.status]} live={a.status === "live"}>{a.status}</Badge>
                    <Badge tone={a.type === "MAINTENANCE" ? "red" : a.type === "WARNING" ? "amber" : "blue"}>{TYPE_LABEL[a.type]}</Badge>
                    <Badge>{a.audience === "ALL" ? "Everyone" : a.audience === "STUDENT" ? "Students" : "Admins"}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-slate-500">{a.body}</p>
                  <p className="mt-1.5 font-mono text-xs text-slate-400">
                    {a.startsAt ? `From ${formatDate(a.startsAt)}` : "Starts immediately"}
                    {a.endsAt ? ` until ${formatDate(a.endsAt)}` : ", no end date"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button role="switch" aria-checked={a.isActive} aria-label={a.isActive ? "Disable announcement" : "Enable announcement"} onClick={() => toggle(a)} className="switch focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200" />
                  <Button small variant="ghost" onClick={() => setEditing(a)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={() => remove(a)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function AnnouncementForm({ initial, onSaved, onCancel }: { initial?: Ann; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    type: (initial?.type ?? "INFO") as AnnType,
    audience: (initial?.audience ?? "ALL") as Audience,
    startsAt: toLocalInput(initial?.startsAt),
    endsAt: toLocalInput(initial?.endsAt),
    isActive: initial?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  const blocksTests = f.type === "MAINTENANCE" && f.audience !== "ADMIN";
  const publicRisk = f.audience === "ALL" && f.type !== "RELEASE_NOTE";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!f.title.trim()) v.title = "Title is required.";
    else if (f.title.length > 120) v.title = "Keep the title under 120 characters.";
    if (!f.body.trim()) v.body = "Message is required.";
    else if (f.body.length > 1000) v.body = `Message is ${f.body.length - 1000} characters too long (max 1000).`;
    if (f.startsAt && f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt)) v.endsAt = "End must be after the start.";
    if (f.endsAt && f.endsAt !== toLocalInput(initial?.endsAt) && new Date(f.endsAt) <= new Date()) v.endsAt = "The end time is already in the past.";
    setErrors(v);
    if (Object.keys(v).length) return;

    setBusy(true);
    const body = {
      title: f.title.trim(),
      body: f.body.trim(),
      type: f.type,
      audience: f.audience,
      startsAt: fromLocalInput(f.startsAt) ?? null,
      endsAt: fromLocalInput(f.endsAt) ?? null,
      isActive: f.isActive,
    };
    const res = initial ? await api("PATCH", `/api/admin/announcements/${initial.id}`, body) : await api("POST", "/api/admin/announcements", body);
    setBusy(false);
    if (!res.ok) return setServerError(errorMessage(res));
    onSaved();
  }

  return (
    <Panel icon={Megaphone} title={initial ? "Edit announcement" : "New announcement"}>
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <FieldError message={errors.title} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label={`Message (${f.body.length}/1000, plain text)`} rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} error={errors.body} />
        </div>
        <Select label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AnnType })}>
          {(Object.keys(TYPE_LABEL) as AnnType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Select label="Show to" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as Audience })}>
          {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_LABEL[a]}
            </option>
          ))}
        </Select>
        <div>
          <Field label="Starts (optional)" type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
        </div>
        <div>
          <Field label="Ends (optional)" type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
          <FieldError message={errors.endsAt} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
          <Toggle label="Active" description="Inactive announcements are never shown." checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
        </div>

        <div className="space-y-2 text-sm sm:col-span-2">
          {blocksTests && (
            <p className="slide-down rounded-lg bg-red-50 px-3 py-2 text-red-800">
              <strong>Maintenance mode:</strong> while this is live, students cannot start new tests. Tests already in progress keep working and can be submitted.
            </p>
          )}
          {f.type === "RELEASE_NOTE" && <p className="slide-down rounded-lg bg-brand-50 px-3 py-2 text-brand-800">Shown once to each signed-in user as a &quot;What&apos;s new&quot; pop-up. It never appears on the login page.</p>}
          {publicRisk && <p className="text-slate-500">&quot;Everyone&quot; notices are also visible on the public login pages. Don&apos;t put anything private here.</p>}
        </div>

        <div className="space-y-3 sm:col-span-2">
          <ErrorText message={serverError} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" busy={busy}>
              {initial ? "Save changes" : "Publish announcement"}
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
