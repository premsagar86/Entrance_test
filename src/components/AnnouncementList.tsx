"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AlertTriangle, Info, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { api, errorMessage } from "@/lib/client-api";
import { Badge, Empty, Panel, SkeletonRows, formatDate } from "@/components/admin";
import { ErrorText } from "@/components/ui";

type AnnType = "INFO" | "MAINTENANCE" | "WARNING" | "RELEASE_NOTE";
interface Item {
  id: string;
  title: string;
  body: string;
  type: AnnType;
  createdAt: string;
}

const META: Record<AnnType, { icon: LucideIcon; tile: string; label: string; tone: "blue" | "amber" | "red" | "green" }> = {
  INFO: { icon: Info, tile: "from-brand-600 to-cyan-500", label: "Info", tone: "blue" },
  WARNING: { icon: AlertTriangle, tile: "from-amber-500 to-orange-400", label: "Warning", tone: "amber" },
  MAINTENANCE: { icon: Wrench, tile: "from-red-600 to-rose-400", label: "Maintenance", tone: "red" },
  RELEASE_NOTE: { icon: Sparkles, tile: "from-violet-600 to-indigo-500", label: "What's new", tone: "green" },
};

export function AnnouncementList() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: Item[] }>("GET", "/api/announcements?all=1").then((res) => {
      if (!res.ok) return setError(errorMessage(res));
      setItems(res.data.items);
    });
  }, []);

  if (error) return <ErrorText message={error} />;
  if (!items) return <Panel><SkeletonRows rows={3} /></Panel>;
  if (items.length === 0) return <Empty title="No announcements" text="Notices from your institute will show up here." />;

  return (
    <ul className="space-y-3">
      {items.map((a, idx) => {
        const m = META[a.type];
        const Icon = m.icon;
        return (
          <li key={a.id} className="stg-i card-hover flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" style={{ "--i": Math.min(idx, 10) } as CSSProperties}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${m.tile}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{a.title}</h3>
                <Badge tone={m.tone}>{m.label}</Badge>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
              <p className="mt-2 font-mono text-xs text-slate-400">{formatDate(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
