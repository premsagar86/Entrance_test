"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Announcements } from "@/components/Announcements";
import { StudentLoginForm } from "@/components/auth/StudentLoginForm";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

type Mode = "student" | "admin";
const DUR = 1000; // keep in sync with --dur in globals.css
const PATH: Record<Mode, string> = { student: "/login", admin: "/admin/login" };

/**
 * One card, two sign-in flows. A skewed blade sweeps across the card; while it covers
 * the card the two forms swap places, then the blade settles on the other side.
 */
export function AuthExperience({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial); // drives the blade
  const [paneMode, setPaneMode] = useState<Mode>(initial); // drives which form is live
  const [moving, setMoving] = useState(false);
  const timers = useRef<number[]>([]);
  const studentPane = useRef<HTMLElement>(null);
  const adminPane = useRef<HTMLElement>(null);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  // The hidden form must not be reachable by keyboard or screen reader.
  useEffect(() => {
    const set = (el: HTMLElement | null, off: boolean) => {
      if (el) (el as HTMLElement & { inert: boolean }).inert = off;
    };
    set(studentPane.current, paneMode !== "student");
    set(adminPane.current, paneMode !== "admin");
  }, [paneMode]);

  const go = useCallback(
    (next: Mode) => {
      if (next === mode || moving) return;
      const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(max-width: 767px)").matches;
      window.history.replaceState(null, "", PATH[next]);
      setMode(next);
      const swap = () => setPaneMode(next);
      const done = () => {
        setMoving(false);
        const pane = next === "student" ? studentPane.current : adminPane.current;
        pane?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus({ preventScroll: true });
      };
      if (instant) {
        swap();
        done();
        return;
      }
      setMoving(true);
      timers.current.push(window.setTimeout(swap, DUR * 0.42), window.setTimeout(done, DUR));
    },
    [mode, moving],
  );

  return (
    <div className="auth-stage flex min-h-screen flex-col items-center justify-center px-4 py-6">
      <div className="mb-5 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-300/70">Aptitude Test Platform</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {mode === "student" ? "Student" : "Admin"} <span className="bg-gradient-to-r from-brand-400 to-cyan-300 bg-clip-text text-transparent">sign in</span>
        </h1>
      </div>

      <div className="w-full max-w-4xl">
        <Announcements />
        <div className="auth" data-mode={mode} data-moving={moving}>
          {/* The blade (desktop only) */}
          <div className="auth__band" aria-hidden={paneMode === mode ? undefined : true}>
            <span className="auth__edge auth__edge--lead" />
            <span className="auth__edge auth__edge--trail" />
            <div className="auth__inner">
              <div className="auth__page">
                <div className="auth__flash">APTITUDE<span className="text-cyan-300">/</span></div>
                <div className={`auth__copy auth__copy--student ${mode === "student" ? "is-on" : ""}`}>
                  <BladeCopy
                    kicker="Student portal"
                    line="Welcome"
                    accent="back."
                    text="Your tests, results and announcements are exactly where you left them."
                  />
                </div>
                <div className={`auth__copy auth__copy--admin ${mode === "admin" ? "is-on" : ""}`}>
                  <BladeCopy kicker="Admin console" line="Run the" accent="exam." text="Upload questions, publish tests and review every result in one place." />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: tabs replace the blade */}
          <div className="auth__tabs grid-cols-2 gap-1 border-b border-slate-200 bg-white/70 p-1.5" role="tablist">
            {(["student", "admin"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => go(m)}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mode === m ? "bg-gradient-to-r from-brand-600 to-cyan-500 text-white shadow-sm" : "text-slate-600"}`}
              >
                {m === "student" ? "Student" : "Admin"}
              </button>
            ))}
          </div>

          {/* Student pane */}
          <section ref={studentPane} className={`auth__pane auth__pane--student ${paneMode === "student" ? "is-on" : ""}`} aria-label="Student sign in">
            <Heading title="Sign in" subtitle="Use your registered email to start your test." />
            <StudentLoginForm active={paneMode === "student"} />
            <SwitchLink onClick={() => go("admin")} lead="Are you an administrator?" action="Admin sign in" />
          </section>

          {/* Admin pane */}
          <section ref={adminPane} className={`auth__pane auth__pane--admin ${paneMode === "admin" ? "is-on" : ""}`} aria-label="Admin sign in">
            <Heading title="Admin sign in" subtitle="Enter your email and phone number." />
            <AdminLoginForm active={paneMode === "admin"} />
            <SwitchLink onClick={() => go("student")} lead="Are you a student?" action="Student sign in" />
          </section>
        </div>
      </div>
    </div>
  );
}

function BladeCopy({ kicker, line, accent, text }: { kicker: string; line: string; accent: string; text: string }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-300">
        <GraduationCap className="h-4 w-4" /> {kicker}
      </div>
      <p className="text-4xl font-semibold leading-[1.05] tracking-tight">
        {line}
        <br />
        <em className="font-serif font-normal not-italic text-cyan-300 [font-style:italic]">{accent}</em>
      </p>
      <p className="mt-4 text-sm leading-relaxed text-blue-100/80">{text}</p>
    </div>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="stg mb-6" style={{ "--i": 0 } as React.CSSProperties}>
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-2 h-0.5 w-10 rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" />
      <p className="mt-3 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function SwitchLink({ onClick, lead, action }: { onClick: () => void; lead: string; action: string }) {
  return (
    <p className="mt-6 text-center text-sm text-slate-500">
      {lead}{" "}
      <button type="button" onClick={onClick} className="group inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700">
        {action}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </p>
  );
}
