import { CheckCircle2, Mail, IdCard } from "lucide-react";

export interface StudentProfile {
  name: string;
  email: string;
  rollNo: string | null;
  batch: string | null;
}

/** GitHub-style profile card for the left column of the student dashboard. */
export function StudentProfileCard({
  profile,
  completed,
  total,
  averagePct,
}: {
  profile: StudentProfile;
  completed?: number;
  total?: number;
  averagePct?: number | null;
}) {
  const showProgress = completed !== undefined && total !== undefined;
  const ratio = showProgress && total ? Math.round((completed / total) * 100) : 0;
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_16px_-4px_rgba(37,99,235,0.12)] ">
      <div className="flex items-center gap-4 lg:flex-col lg:items-start">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-500 text-2xl font-bold text-white shadow-sm lg:h-24 lg:w-24 lg:text-4xl">
          {profile.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold leading-tight text-slate-900">{profile.name}</h2>
          <p className="text-sm text-slate-500">Student{profile.batch ? ` · ${profile.batch}` : ""}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <li className="flex items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{profile.email}</span>
        </li>
        {profile.rollNo && (
          <li className="flex items-center gap-2">
            <IdCard className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="font-mono">{profile.rollNo}</span>
          </li>
        )}
      </ul>

      {showProgress && (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className="label-mono text-slate-500">Your progress</p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {completed} of {total} completed
          </span>
          <span className="font-mono font-semibold text-slate-900">{ratio}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${ratio}%` }} />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Average score: <span className="font-mono font-semibold text-slate-900">{averagePct == null ? "-" : `${averagePct}%`}</span>
        </p>
      </div>
      )}
    </aside>
  );
}
