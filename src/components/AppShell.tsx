import type { ReactNode } from "react";
import { StudentSidebar } from "@/components/AdminNav";
import { Announcements } from "@/components/Announcements";
import { ToastProvider } from "@/components/Toast";

/** Student portal shell: sidebar navigation plus the content area. */
export function AppShell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ToastProvider>
    <StudentSidebar name={name}>
      <main className="app-in mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-8 lg:py-8">
        <Announcements />
        {children}
      </main>
    </StudentSidebar>
    </ToastProvider>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-surface px-6 py-14 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p>
    </div>
  );
}
