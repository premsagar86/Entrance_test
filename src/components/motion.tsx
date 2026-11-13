"use client";

import { useEffect, useRef, useState } from "react";

/** Animates a number from 0 to `value` once, when it first scrolls into view. */
export function useCountUp(value: number, duration = 900) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !Number.isFinite(value)) {
      setShown(value);
      return;
    }
    setShown(0);
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (!("IntersectionObserver" in window)) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        io.disconnect();
        run();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return { ref, shown };
}

export function CountUp({ value, suffix = "", className = "", duration }: { value: number; suffix?: string; className?: string; duration?: number }) {
  const { ref, shown } = useCountUp(value, duration);
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
}

/** Smoothly expands/collapses its children (height + fade) without measuring. */
export function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!open}>
      <div className="min-h-0 overflow-hidden">
        <div inert={!open ? ("" as unknown as boolean) : undefined}>{children}</div>
      </div>
    </div>
  );
}
