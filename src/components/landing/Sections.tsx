import Link from "next/link";
import {
  ArrowRight, BarChart3, Check, FileUp, Lock, Megaphone, Rocket, Save, ShieldCheck, TimerReset, Trophy, Users, Zap, type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { Reveal } from "@/components/landing/Reveal";import type { Viewer } from "@/components/landing/Navbar";

function Heading({ kicker, title, text, center = true }: { kicker: string; title: string; text?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">{kicker}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-slate-600">{text}</p>}
    </div>
  );
}

const TILE: Record<string, string> = {
  blue: "from-brand-600 to-cyan-500",
  violet: "from-violet-600 to-indigo-500",
  emerald: "from-emerald-600 to-teal-400",
  amber: "from-amber-500 to-orange-400",
  rose: "from-rose-500 to-pink-400",
  slate: "from-slate-700 to-slate-500",
};

function Tile({ icon: Icon, tone }: { icon: LucideIcon; tone: keyof typeof TILE }) {
  return (
    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm ${TILE[tone]}`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Gradient banner under the hero. */
export function Banner({ viewer }: { viewer: Viewer }) {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-gradient-to-r from-brand-700 via-brand-600 to-cyan-500 p-6 text-white shadow-[0_20px_50px_-20px_rgba(37,99,235,0.7)] sm:p-8">
          <h2 className="max-w-xl text-2xl font-bold leading-snug tracking-tight sm:text-3xl">From question paper to published test in minutes.</h2>
          <Link href={viewer === "ADMIN" ? "/admin" : viewer === "STUDENT" ? "/dashboard" : "/admin/login"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">
            {viewer === null ? "Admin sign in" : "Open my portal"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

const HIGHLIGHTS: { icon: LucideIcon; tone: keyof typeof TILE; title: string; text: string }[] = [
  { icon: TimerReset, tone: "amber", title: "Timed and resumable", text: "A server-side clock that a refresh cannot reset." },
  { icon: Zap, tone: "blue", title: "Instant results", text: "Scored the moment a student submits." },
  { icon: Lock, tone: "violet", title: "One fair attempt", text: "Each student gets a single attempt per test." },
  { icon: ShieldCheck, tone: "emerald", title: "You control release", text: "Hold results and release them when ready." },
];

export function Highlights() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HIGHLIGHTS.map((h, i) => (
          <Reveal key={h.title} delay={i * 70}>
            <div className="h-full rounded-2xl border border-white bg-white/80 p-5 shadow-[0_6px_24px_-10px_rgba(37,99,235,0.25)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_14px_34px_-12px_rgba(37,99,235,0.35)]">
              <Tile icon={h.icon} tone={h.tone} />
              <p className="mt-4 font-semibold text-slate-900">{h.title}</p>
              <p className="mt-1 text-sm text-slate-500">{h.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Users, title: "Add your students", text: "Import a CSV with email, name, date of birth and roll number. Nobody signs themselves up." },
  { icon: FileUp, title: "Upload a question paper", text: "Drop in a PDF, DOCX, XLSX or TXT. Questions are extracted into a draft test for you to review and correct." },
  { icon: Rocket, title: "Publish and assign", text: "Set the duration and window, assign students, publish. They sit the test and you review ranked results." },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><Heading kicker="How it works" title="Three steps from document to results" text="No spreadsheets of marks to compile by hand. Set it up once and the platform runs the exam." /></Reveal>
        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-7 hidden h-px bg-gradient-to-r from-brand-200 via-cyan-300 to-brand-200 md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 90}>
              <div className="relative text-center">
                <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-500 text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.7)]">
                  <s.icon className="h-6 w-6" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white font-mono text-xs font-bold text-brand-700 shadow">{i + 1}</span>
                </span>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm text-slate-600">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES: { icon: LucideIcon; tone: keyof typeof TILE; title: string; text: string }[] = [
  { icon: TimerReset, tone: "amber", title: "Smart timer", text: "The server owns the clock. The test auto-submits at zero, and your time is capped by the closing window." },
  { icon: Save, tone: "emerald", title: "Autosave and resume", text: "Answers save as students go. A refresh or dropped connection picks up with the time that is left." },
  { icon: FileUp, tone: "blue", title: "Questions from documents", text: "Turn PDF, Word, Excel or text papers into a draft test, then fix any answer key before publishing." },
  { icon: BarChart3, tone: "violet", title: "Ranked results and export", text: "See every student's score in a ranked table, drill into answers, and export the results to CSV." },
  { icon: Megaphone, tone: "rose", title: "Announcements", text: "Post notices, warnings, maintenance windows and release notes that students see in the portal." },
  { icon: ShieldCheck, tone: "slate", title: "Secure by design", text: "Correct answers never leave the server before release. Logins are rate limited and admins verify with a one-time code." },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 bg-white/60 py-16 backdrop-blur sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><Heading kicker="Why Aptitude" title="Everything an exam day needs" text="Built around the moments that go wrong in online tests: connection drops, clock tampering, and slow marking." /></Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <article className="h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_18px_40px_-18px_rgba(37,99,235,0.4)]">
                <Tile icon={f.icon} tone={f.tone} />
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-sm text-slate-700">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-3 w-3" /></span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Audience({ viewer }: { viewer: Viewer }) {
  return (
    <section id="audience" className="scroll-mt-24 mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-6 sm:py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">For students</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Sit the test. See your score.</h2>
          <p className="mt-4 text-slate-600">A calm, distraction-free test screen and a dashboard that keeps your tests, results and notices in one place.</p>
          <Checks items={["Sign in with your registered email and roll number or date of birth", "Question palette with mark-for-review so you can jump around", "Your answers autosave, even if your connection drops", "Results history with a score bar for every test"]} />
          <Link href={viewer === "STUDENT" ? "/dashboard" : "/login"} className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-cyan-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-brand-700 hover:to-cyan-600">
            {viewer === "STUDENT" ? "Go to dashboard" : "Student sign in"} <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
        <Reveal delay={100}>
          <div className="rounded-3xl border border-white bg-white/90 p-6 shadow-[0_24px_60px_-28px_rgba(37,99,235,0.5)]" aria-hidden>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sample results</p>
            {[["Logical Reasoning", 84], ["Quantitative Aptitude", 62], ["Verbal Ability", 35]].map(([t, p]) => (
              <div key={t as string} className="mt-5">
                <div className="flex justify-between text-sm"><span className="font-medium text-slate-800">{t}</span><span className="font-mono text-slate-500">{p}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${(p as number) >= 70 ? "bg-emerald-500" : (p as number) >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${p}%` }} /></div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal delay={100} className="order-2 lg:order-1">
          <div className="rounded-3xl border border-white bg-white/90 p-6 shadow-[0_24px_60px_-28px_rgba(37,99,235,0.5)]" aria-hidden>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sample ranked results</p>
            <div className="mt-4 divide-y divide-slate-100 text-sm">
              {[["1", "Student A", "46/50"], ["2", "Student B", "44/50"], ["3", "Student C", "41/50"]].map(([r, n, s]) => (
                <div key={r} className="flex items-center gap-3 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 font-mono text-xs font-bold text-brand-600">{r === "1" ? <Trophy className="h-3.5 w-3.5" /> : r}</span>
                  <span className="flex-1 font-medium text-slate-800">{n}</span>
                  <span className="font-mono font-semibold text-slate-900">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal className="order-1 lg:order-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">For admins</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Set it up once. Let it run.</h2>
          <p className="mt-4 text-slate-600">Manage students, papers, tests and results from one console, with full control over when results go out.</p>
          <Checks items={["Secure sign in with a one-time code sent to your email", "Import students from CSV and assign tests to them", "Review extracted questions and correct the answer key", "Hold or release results, reset an attempt, export to CSV"]} />
          <Link href={viewer === "ADMIN" ? "/admin" : "/admin/login"} className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            {viewer === "ADMIN" ? "Go to admin panel" : "Admin sign in"} <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const FAQ: [string, string][] = [
  ["How do students get an account?", "They don't create one. Your institute registers students, so you sign in with the email and roll number or date of birth they have on file."],
  ["How many times can a student take a test?", "Once. The timer starts when they press Start and cannot be paused."],
  ["What if the internet drops or the page is refreshed?", "Answers autosave. Reopening the test continues with the time that is left."],
  ["When are results shown?", "Straight after submitting, unless the admin chooses to hold them. Held results appear once released."],
  ["Which question files can be uploaded?", "PDF, DOCX, XLSX and TXT. Extracted questions land in a draft test that the admin reviews before publishing."],
  ["I cannot sign in.", "Check you are using the registered email. After several failed attempts there is a short lockout. Contact your institute to confirm your details."],
];

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 bg-white/60 py-16 backdrop-blur sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal><Heading kicker="FAQ" title="Questions, answered" /></Reveal>
        <Reveal delay={80}>
          <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta({ viewer }: { viewer: Viewer }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-cyan-600 px-6 py-14 text-center text-white sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready to run your next test?</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-brand-100">Students sign in to take their tests. Administrators sign in to set them up.</p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            {viewer === null ? (
              <>
                <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-brand-700 transition hover:-translate-y-0.5 hover:bg-brand-50">Student sign in <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/admin/login" className="inline-flex h-12 items-center rounded-xl border border-white/40 px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10">Admin sign in</Link>
              </>
            ) : (
              <Link href={viewer === "ADMIN" ? "/admin" : "/dashboard"} className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-brand-700 transition hover:-translate-y-0.5">Open my portal <ArrowRight className="h-4 w-4" /></Link>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-8 px-4 py-10 sm:px-6">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-slate-500">Online aptitude tests with server-enforced timing, autosave and instant results.</p>
        </div>
        <div className="flex gap-16 text-sm">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick links</p>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li><a href="#features" className="hover:text-brand-600">Features</a></li>
              <li><a href="#how" className="hover:text-brand-600">How it works</a></li>
              <li><a href="#faq" className="hover:text-brand-600">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sign in</p>
            <ul className="mt-3 space-y-2 text-slate-600">
              <li><Link href="/login" className="hover:text-brand-600">Student</Link></li>
              <li><Link href="/admin/login" className="hover:text-brand-600">Admin</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">Need access? Contact your institute to be registered.</div>
    </footer>
  );
}
