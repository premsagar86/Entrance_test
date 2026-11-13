import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Save, Zap } from "lucide-react";
import type { Viewer } from "@/components/landing/Navbar";

export function Hero({ viewer }: { viewer: Viewer }) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
        <div>
          <p className="lp-in inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-600 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" /> Online aptitude testing
          </p>
          <h1 className="lp-in mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]" style={{ "--d": "80ms" } as React.CSSProperties}>
            Run fair, timed aptitude tests, and see results{" "}
            <span className="bg-gradient-to-r from-brand-600 to-cyan-500 bg-clip-text text-transparent">the moment they finish.</span>
          </h1>
          <p className="lp-in mt-5 max-w-xl text-lg leading-relaxed text-slate-600" style={{ "--d": "160ms" } as React.CSSProperties}>
            Upload a question paper, publish a test, and let students sit it on any device. The timer is enforced by the server, answers autosave, and scoring is instant.
          </p>
          <div className="lp-in mt-8 flex flex-wrap gap-3" style={{ "--d": "240ms" } as React.CSSProperties}>
            {viewer === null ? (
              <>
                <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.7)] transition hover:-translate-y-0.5 hover:from-brand-700 hover:to-cyan-600">
                  Student sign in <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/admin/login" className="inline-flex h-12 items-center rounded-xl border border-slate-300 bg-white/80 px-6 text-sm font-semibold text-slate-700 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white">
                  Admin sign in
                </Link>
              </>
            ) : (
              <Link href={viewer === "ADMIN" ? "/admin" : "/dashboard"} className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.7)] transition hover:-translate-y-0.5">
                {viewer === "ADMIN" ? "Go to admin panel" : "Go to dashboard"} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          <ul className="lp-in mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600" style={{ "--d": "320ms" } as React.CSSProperties}>
            {[
              [Save, "Autosave and resume"],
              [Clock, "Server-enforced timer"],
              [Zap, "Instant results"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Save;
              return (
                <li key={label as string} className="flex items-center gap-2">
                  <I className="h-4 w-4 text-brand-600" /> {label as string}
                </li>
              );
            })}
          </ul>
        </div>
        <ProductMock />
      </div>
    </section>
  );
}

/** Illustrative test-runner screen built from HTML/CSS (sample content, not live data). */
function ProductMock() {
  const palette = ["a", "a", "a", "c", "a", "m", "a", "a", "u", "u", "u", "u"];
  const tone: Record<string, string> = { a: "bg-emerald-500 text-white", c: "bg-brand-600 text-white ring-4 ring-brand-200", m: "bg-amber-400 text-amber-950", u: "bg-slate-100 text-slate-500" };
  return (
    <div className="relative mx-auto w-full max-w-lg lp-in" style={{ "--d": "200ms" } as React.CSSProperties} aria-hidden>
      {/* floating shapes */}
      <div className="lp-drift absolute -left-6 -top-6 h-20 w-20 rounded-3xl bg-gradient-to-br from-cyan-300 to-brand-400 opacity-80 blur-[1px]" />
      <div className="lp-drift absolute -bottom-8 right-6 h-24 w-24 rounded-full bg-gradient-to-br from-rose-200 to-amber-200 opacity-90" style={{ animationDelay: "-3s" }} />
      <div className="absolute -right-4 top-10 h-12 w-12 rotate-12 rounded-xl border-2 border-brand-300/70" />

      <div className="relative rounded-3xl border border-white bg-white/90 p-5 shadow-[0_30px_80px_-30px_rgba(37,99,235,0.55)] backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="font-mono text-xs text-slate-400">Quantitative Aptitude</span>
          <span className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 font-mono text-sm font-semibold text-amber-800">
            <Clock className="h-3.5 w-3.5" /> 12:45
          </span>
        </div>
        <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-wider text-brand-600">Question 6 of 12</p>
        <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">A train covers 120 km in 2 hours. What is its average speed?</p>
        <ul className="mt-4 space-y-2.5">
          {["40 km/h", "60 km/h", "80 km/h", "90 km/h"].map((o, i) => (
            <li key={o} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${i === 1 ? "border-brand-500 bg-brand-50 font-medium text-brand-700" : "border-slate-200 text-slate-600"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${i === 1 ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}>{"ABCD"[i]}</span>
              {o}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="grid grid-cols-6 gap-1.5">
            {palette.map((p, i) => (
              <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold ${tone[p]}`}>
                {i + 1}
              </span>
            ))}
          </div>
          <span className="inline-flex h-9 items-center rounded-lg bg-gradient-to-r from-brand-600 to-cyan-500 px-4 text-xs font-semibold text-white">Next</span>
        </div>
      </div>

      <div className="lp-float absolute -left-8 bottom-16 flex items-center gap-2.5 rounded-2xl border border-white bg-white px-3.5 py-2.5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.35)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
        <div>
          <p className="text-xs font-semibold text-slate-900">Answers autosaved</p>
          <p className="text-[11px] text-slate-500">Safe if you refresh</p>
        </div>
      </div>
      <div className="lp-float absolute -right-4 -top-2 rounded-2xl border border-white bg-white px-3.5 py-2.5 shadow-[0_14px_40px_-12px_rgba(15,23,42,0.35)]" style={{ animationDelay: "-2s" }}>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sample result</p>
        <p className="font-mono text-lg font-bold text-slate-900">42<span className="text-slate-400">/50</span></p>
      </div>
    </div>
  );
}
