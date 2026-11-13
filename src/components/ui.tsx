"use client";

import { useRef, useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, GraduationCap, Loader2, type LucideIcon } from "lucide-react";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${light ? "bg-white/15 text-white" : "bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-sm"}`}>
        <GraduationCap className="h-5 w-5" />
      </span>
      <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>Aptitude</span>
    </div>
  );
}

export function Field({ label, hint, icon: Icon, type, ...props }: { label: string; hint?: string; icon?: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <input {...props} type={type} className={`input-base ${Icon ? "pl-10" : ""}`} />
      </span>
      {hint && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function SecretField({ label, icon: Icon, ...props }: { label: string; icon?: LucideIcon } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <input {...props} type={show ? "text" : "password"} className={`input-base pr-10 ${Icon ? "pl-10" : ""}`} />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide" : "Show"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="btn-primary">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {busy ? "Please wait..." : children}
    </button>
  );
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function InfoText({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" className="relative grid grid-flow-col auto-cols-fr rounded-lg bg-slate-100 p-1 text-sm">
      {/* sliding pill behind the active option */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-md bg-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 rounded-md px-3 py-2 font-medium transition-colors ${value === o.value ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Six-box one-time code input with auto-advance, backspace and paste support. */
export function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join(""));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const c = e.target.value.replace(/\D/g, "").slice(-1);
            set(i, c);
            if (c && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          className="h-12 w-full rounded-lg border border-slate-300 bg-surface text-center text-lg font-semibold text-slate-900 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      ))}
    </div>
  );
}
