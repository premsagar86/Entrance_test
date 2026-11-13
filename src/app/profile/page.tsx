import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel } from "@/components/admin";
import { StudentProfileCard } from "@/components/StudentProfileCard";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession("STUDENT");
  if (!session) redirect("/login");
  const student = await db.student.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, rollNo: true, batch: true },
  });
  if (!student) redirect("/login");
  const details: [string, string][] = [
    ["Full name", student.name],
    ["Email", student.email],
    ["Roll number", student.rollNo ?? "-"],
    ["Batch", student.batch ?? "-"],
  ];
  return (
    <AppShell name={student.name}>
      <PageHeader title="Profile" subtitle="Your details as registered by your institute." />
      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        <StudentProfileCard profile={student} />
        <Panel title="Account details" description="These details are managed by your institute. Contact them if something is wrong.">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {details.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3">
                <dt className="label-mono text-slate-500">{k}</dt>
                <dd className="mt-1 break-words font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </AppShell>
  );
}
