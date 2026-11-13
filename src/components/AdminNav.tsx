"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronLeft, FileUp, GraduationCap, HelpCircle, LayoutDashboard, Megaphone, Menu, Trophy, User, Users, X, type LucideIcon } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Extra path prefixes that should also highlight this item. */
  also?: string[];
}

const ADMIN_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/documents", label: "Documents", icon: FileUp },
  { href: "/admin/tests", label: "Tests", icon: BookOpen },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

const STUDENT_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/results", label: "My Results", icon: Trophy, also: ["/result"] },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/help", label: "Help", icon: HelpCircle },
];

export function AdminSidebar({ adminName, children }: { adminName: string; children: ReactNode }) {
  return (
    <PortalSidebar name={adminName} role="Administrator" panelLabel="Admin Panel" logoutTo="/admin/login" items={ADMIN_ITEMS}>
      {children}
    </PortalSidebar>
  );
}

export function StudentSidebar({ name, children }: { name: string; children: ReactNode }) {
  return (
    <PortalSidebar name={name} role="Student" panelLabel="Student Portal" logoutTo="/login" items={STUDENT_ITEMS}>
      {children}
    </PortalSidebar>
  );
}

/** Full-height sidebar (collapsible on desktop, drawer on mobile) wrapping the page content. */
function PortalSidebar({ name: adminName, role, panelLabel, logoutTo, items, children }: { name: string; role: string; panelLabel: string; logoutTo: string; items: NavItem[]; children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("admin-sidebar") === "collapsed");
    } catch {}
  }, []);
  useEffect(() => setOpen(false), [path]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("admin-sidebar", next ? "collapsed" : "expanded");
    } catch {}
  };

  const nav = (compact: boolean) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
      {items.map(({ href, label, icon: Icon, exact, also }) => {
        const active = exact ? path === href : [href, ...(also ?? [])].some((p) => path === p || path.startsWith(p + "/"));
        return (
          <Link
            key={href}
            href={href}
            title={label}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${compact ? "justify-center" : ""} ${
              active ? "bg-brand-50 text-brand-600" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!compact && label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (compact: boolean) => (
    <div className={`border-b border-slate-100 ${compact ? "px-3 py-5" : "px-6 py-6"}`}>
      <div className={`flex items-center gap-2.5 ${compact ? "justify-center" : ""}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-sm">
          <GraduationCap className="h-5 w-5" />
        </span>
        {!compact && (
          <div>
            <p className="text-xl font-extrabold leading-none tracking-tight text-slate-900">
              APTITUDE<span className="text-brand-600">/</span>
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">{panelLabel}</p>
          </div>
        )}
      </div>
    </div>
  );

  const footer = (compact: boolean) => (
    <div className="border-t border-slate-100 p-3">
      {!compact && (
        <div className="mb-2 flex items-center gap-2.5 px-3 py-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {adminName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-slate-900">{adminName}</p>
            <p className="text-xs text-slate-500">{role}</p>
          </div>
        </div>
      )}
      <LogoutButton to={logoutTo} variant="sidebar" collapsed={compact} />
    </div>
  );

  return (
    <div className="min-h-screen bg-app">
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px]" : "w-[260px]"}`}
      >
        {brand(collapsed)}
        {nav(collapsed)}
        {footer(collapsed)}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3.5 top-8 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-brand-600 shadow-sm transition hover:bg-brand-50"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <p className="text-lg font-extrabold tracking-tight text-slate-900">
          APTITUDE<span className="text-brand-600">/</span>
        </p>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[270px] flex-col bg-white shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            {brand(false)}
            {nav(false)}
            {footer(false)}
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]"}`}>{children}</div>
    </div>
  );
}
