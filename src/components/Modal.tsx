"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: portal, blur backdrop, Escape to close, focus trap and focus restore. */
export function Modal({
  open,
  onClose,
  label,
  children,
  dismissible = true,
  className = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  dismissible?: boolean;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the focus/keyboard effect on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = panel.current;
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, dismissible]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="backdrop-enter absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`modal-enter relative w-full rounded-2xl bg-white p-6 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.5)] outline-none ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
