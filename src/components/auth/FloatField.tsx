"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

/**
 * Underline input with a floating label and a glowing focus underline.
 * `alwaysFloat` is for inputs that always show something (e.g. type="date").
 */
export function FloatField({
  label,
  hint,
  icon: Icon,
  secret = false,
  alwaysFloat = false,
  ...props
}: { label: string; hint?: string; icon?: LucideIcon; secret?: boolean; alwaysFloat?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const type = secret ? (show ? "text" : "password") : props.type;
  // Tailwind needs literal class names, so these are spelled out in full.
  const floated = "-translate-y-[22px] scale-[0.8] text-brand-600";
  return (
    <div>
      <label className="relative block pt-5">
        <input
          {...props}
          type={type}
          placeholder=" "
          className="peer h-10 w-full border-b border-slate-300 bg-transparent pr-9 text-[15px] text-slate-900 outline-none transition-colors"
        />
        <span
          className={`pointer-events-none absolute left-0 top-[34px] origin-left text-[15px] text-slate-500 transition-all duration-200 peer-focus:-translate-y-[22px] peer-focus:scale-[0.8] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:-translate-y-[22px] peer-[:not(:placeholder-shown)]:scale-[0.8] peer-[:not(:placeholder-shown)]:text-brand-600 peer-autofill:-translate-y-[22px] peer-autofill:scale-[0.8] peer-autofill:text-brand-600 ${alwaysFloat ? floated : ""}`}
        >
          {label}
        </span>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 rounded bg-gradient-to-r from-brand-600 to-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] transition-transform duration-300 peer-focus:scale-x-100" />
        {secret ? (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide" : "Show"}
            className="absolute bottom-2 right-0 rounded p-1 text-slate-400 transition hover:text-brand-600"
          >
            {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        ) : (
          Icon && <Icon className="pointer-events-none absolute bottom-3 right-0 h-[18px] w-[18px] text-slate-400 transition-colors peer-focus:text-brand-600" />
        )}
      </label>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
