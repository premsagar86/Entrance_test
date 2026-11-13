import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel } from "@/components/admin";

export const dynamic = "force-dynamic";

const FAQ: [string, string][] = [
  ["How many times can I take a test?", "Once. The timer starts the moment you press Start and cannot be paused."],
  ["What if my internet drops or I refresh the page?", "Your answers save automatically. Reopen the test from your dashboard and you will continue with the time that is left."],
  ["What happens when time runs out?", "The test submits automatically with the answers you have saved."],
  ["When can I see my result?", "Straight after submitting, unless your institute is holding results. Held results show as pending and appear in My Results once released."],
  ["I cannot log in.", "Use your registered email with either your date of birth (YYYY-MM-DD) or your roll number. After several failed attempts you are locked out for a short while. Contact your institute if your details are wrong."],
  ["A test I expected is not listed.", "Tests appear only after your institute publishes and assigns them to you. Check again later or ask your institute."],
];

export default async function HelpPage() {
  const session = await getSession("STUDENT");
  if (!session) redirect("/login");
  const student = await db.student.findUnique({ where: { id: session.userId }, select: { name: true } });
  if (!student) redirect("/login");
  return (
    <AppShell name={student.name}>
      <PageHeader title="Help" subtitle="Answers to common questions about taking tests." />
      <Panel>
        <div className="divide-y divide-slate-100">
          {FAQ.map(([q, a]) => (
            <details key={q} className="py-3 first:pt-0 last:pb-0">
              <summary className="cursor-pointer font-medium text-slate-900 transition hover:text-brand-600">{q}</summary>
              <p className="slide-down mt-2 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}
