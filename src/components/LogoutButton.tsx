"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { postJson } from "@/lib/client-api";

export function LogoutButton({ to, variant = "outline", collapsed = false }: { to: string; variant?: "outline" | "sidebar"; collapsed?: boolean }) {
  const router = useRouter();
  const sidebar = variant === "sidebar";
  return (
    <button
      onClick={async () => {
        await postJson("/api/auth/logout", {});
        router.replace(to);
        router.refresh();
      }}
      title="Sign Out"
      className={
        sidebar
          ? `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-red-50 ${collapsed ? "justify-center" : ""}`
          : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      }
    >
      <LogOut className="h-[18px] w-[18px]" />
      {sidebar ? !collapsed && "Sign Out" : <span className="hidden sm:inline">Log out</span>}
    </button>
  );
}
