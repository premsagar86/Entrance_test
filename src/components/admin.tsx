"use client";

import { useEffect, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import Link from "next/link";
import { ArrowLeft, Inbox, Loader2, type LucideIcon } from "lucide-react";

export function PageHeader({ title, subtitle, action, back, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; back?: { href: string; label: string }; icon?: LucideIcon }) {
  return (
    <div className="mb-7">
      {back && (
        <Link href={back.href} className="group mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-brand-600">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3.5">
          {Icon && (
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.7)]">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.7rem]">{title}</h1>
            <div className="bar-grow mt-1.5 h-0.5 w-16 rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" />
            {subtitle && <p className="mt-3 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, description, children, className = "", icon: Icon, index }: { title?: string; description?: string; children: ReactNode; className?: string; icon?: LucideIcon; index?: number }) {
  return (
    <section
      className={`stg-i relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_16px_-6px_rgba(37,99,235,0.18)] ${className}`}
      style={{ "--i": index ?? 0 } as CSSProperties}
    >
      {title && (
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <h2 className="font-semibold text-slate-900">{title}</h2>
        </div>
      )}
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: { box: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  green: { box: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", dot: "bg-emerald-500" },
  amber: { box: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", dot: "bg-amber-500" },
  red: { box: "bg-red-50 text-red-700 ring-1 ring-red-200", dot: "bg-red-500" },
  blue: { box: "bg-brand-50 text-brand-700 ring-1 ring-brand-200", dot: "bg-brand-500" },
} as const;

export function Badge({ tone = "gray", children, live = false }: { tone?: keyof typeof TONES; children: ReactNode; live?: boolean }) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.box}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot} ${live ? "pulse-dot" : ""}`} />
      {children}
    </span>
  );
}

const BTN_BASE = "press inline-flex items-center justify-center gap-1.5 rounded-lg font-medium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60";
const BTN_STYLE = {
  primary: "bg-gradient-to-r from-brand-600 to-cyan-500 text-white shadow-sm hover:-translate-y-px hover:from-brand-700 hover:to-cyan-600 hover:shadow-[0_10px_24px_-10px_rgba(37,99,235,0.8)]",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700",
  danger: "bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-sm hover:from-red-700 hover:to-rose-600",
  ghost: "text-slate-600 hover:bg-slate-100",
} as const;
type Variant = keyof typeof BTN_STYLE;
const size = (small?: boolean) => (small ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; small?: boolean };

export function Button({ variant = "secondary", busy, small, children, disabled, className = "", ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || busy} className={`${BTN_BASE} ${size(small)} ${BTN_STYLE[variant]} ${className}`}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** A link (or plain anchor with `download`) that looks like a Button. */
export function LinkButton({ href, variant = "secondary", small, children, className = "", ...rest }: { href: string; variant?: Variant; small?: boolean; children: ReactNode; className?: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const cls = `${BTN_BASE} ${size(small)} ${BTN_STYLE[variant]} ${className}`;
  return /^(\/api\/|https?:)/.test(href) ? (
    <a href={href} className={cls} {...rest}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

/** Two-step delete: the first click asks, the second confirms (no browser dialogs). */
export function ConfirmButton({ label, confirmLabel = "Confirm", onConfirm, busy }: { label: ReactNode; confirmLabel?: string; onConfirm: () => void; busy?: boolean }) {
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!asking) {
    return (
      <Button
        small
        variant="ghost"
        onClick={() => {
          setAsking(true);
          timer.current = setTimeout(() => setAsking(false), 4000);
        }}
      >
        {label}
      </Button>
    );
  }
  return (
    <span className="modal-enter relative inline-flex overflow-hidden rounded-lg">
      <Button
        small
        variant="danger"
        busy={busy}
        onClick={() => {
          clearTimeout(timer.current);
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      {/* shrinking bar shows how long until the confirmation reverts */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/70" style={{ animation: "confirm-bar 4s linear forwards" }} />
    </span>
  );
}

const FIELD = "w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 disabled:bg-slate-100";
const fieldTone = (error?: string) => (error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-100");

export function Textarea({ label, error, ...props }: { label: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <textarea {...props} className={`${FIELD} py-2 ${fieldTone(error)}`} />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({ label, error, children, className = "", ...props }: { label?: string; error?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const control = (
    <select {...props} className={`${FIELD} h-10 cursor-pointer ${fieldTone(error)} ${className}`}>
      {children}
    </select>
  );
  if (!label) return control;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {control}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

/** Animated on/off switch (a real button with role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="switch mt-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-50" />
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <span className="mt-1 block text-xs text-red-600">{message}</span> : null;
}

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> {label}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden />;
}

/** Placeholder rows shown while a table or list loads. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <Skeleton className="mt-4 h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, text, action, icon: Icon = Inbox }: { title: string; text?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="app-in rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <span className="lp-float mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-cyan-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold text-slate-900">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** ISO string -> value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(v: string): string | undefined {
  return v ? new Date(v).toISOString() : undefined;
}

const AVATAR_TONES = ["from-brand-600 to-cyan-500", "from-violet-600 to-indigo-500", "from-emerald-600 to-teal-400", "from-amber-500 to-orange-400", "from-rose-500 to-pink-400"];

/** Initial-letter avatar with a colour picked from the name. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const tone = AVATAR_TONES[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ${tone}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
