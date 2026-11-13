"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, Sparkles, Wrench, X } from "lucide-react";
import { api } from "@/lib/client-api";
import { Modal } from "@/components/Modal";

type AnnType = "INFO" | "MAINTENANCE" | "WARNING" | "RELEASE_NOTE";
interface Item {
  id: string;
  title: string;
  body: string;
  type: AnnType;
}

const STYLE: Record<Exclude<AnnType, "RELEASE_NOTE">, { box: string; icon: typeof Info }> = {
  INFO: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: Info },
  WARNING: { box: "border-amber-300 bg-amber-50 text-amber-900", icon: AlertTriangle },
  MAINTENANCE: { box: "border-red-300 bg-red-50 text-red-900", icon: Wrench },
};

const LOCAL_KEY = "dismissed-announcements";

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeLocal(ids: string[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    /* storage unavailable: the banner just reappears next visit */
  }
}

/**
 * Banners for notices, plus a one-time "What's new" dialog for release notes.
 * Signed-in users: dismissals are stored on the server per user. Visitors on the login page:
 * only public notices are shown and dismissals are remembered in this browser.
 */
export function Announcements() {
  const [items, setItems] = useState<Item[]>([]);
  const [scope, setScope] = useState<"user" | "public">("public");
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden(readLocal());
    api<{ scope: "user" | "public"; items: Item[] }>("GET", "/api/announcements").then((res) => {
      if (res.ok) {
        setScope(res.data.scope);
        setItems(res.data.items);
      }
    });
  }, []);

  async function dismiss(id: string) {
    setItems((list) => list.filter((i) => i.id !== id));
    if (scope === "user") {
      await api("POST", `/api/announcements/${id}/dismiss`); // best effort: worst case it shows again next visit
    } else {
      const next = [...readLocal(), id];
      writeLocal(next);
      setHidden(next);
    }
  }

  const visible = items.filter((i) => scope === "user" || !hidden.includes(i.id));
  const banners = visible.filter((i): i is Item & { type: Exclude<AnnType, "RELEASE_NOTE"> } => i.type !== "RELEASE_NOTE");
  const note = scope === "user" ? visible.find((i) => i.type === "RELEASE_NOTE") : undefined;

  return (
    <>
      {banners.length > 0 && (
        <div className="mb-4 space-y-2" role="region" aria-label="Announcements">
          {banners.map((a) => {
            const { box, icon: Icon } = STYLE[a.type];
            return (
              <div key={a.id} role={a.type === "INFO" ? "status" : "alert"} className={`slide-down flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${box}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">{a.body}</p>
                </div>
                <button onClick={() => dismiss(a.id)} aria-label={`Dismiss: ${a.title}`} className="rounded p-1 opacity-70 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!note} onClose={() => note && dismiss(note.id)} label="What's new">
        {note && (
          <>
            <div className="flex items-center gap-2 text-brand-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">What&apos;s new</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">{note.title}</h2>
            <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm text-slate-600">{note.body}</p>
            <button data-autofocus onClick={() => dismiss(note.id)} className="btn-primary press mt-6">Got it</button>
          </>
        )}
      </Modal>
    </>
  );
}
