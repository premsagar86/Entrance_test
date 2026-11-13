"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui";
export type Viewer = "STUDENT" | "ADMIN" | null;

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#audience", label: "Students & admins" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar({ viewer }: { viewer: Viewer }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const buttons =
    viewer === null ? (
      <>
        <Link href="/admin/login" className="hidden h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:inline-flex">
          Admin sign in
        </Link>
        <Link href="/login" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-cyan-600">
          Student sign in
        </Link>
      </>
    ) : (
      <Link
        href={viewer === "ADMIN" ? "/admin" : "/dashboard"}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-600 to-cyan-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-cyan-600"
      >
        {viewer === "ADMIN" ? "Go to admin panel" : "Go to dashboard"} <ArrowRight className="h-4 w-4" />
      </Link>
    );

  return (
    <header className={`sticky top-0 z-40 transition-all ${scrolled ? "border-b border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-lg" : "bg-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Aptitude home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-slate-600 transition hover:text-brand-600">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {buttons}
          <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-3 md:hidden" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              {l.label}
            </a>
          ))}
          {viewer === null && (
            <Link href="/admin/login" className="mt-1 block rounded-lg px-3 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50">
              Admin sign in
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
