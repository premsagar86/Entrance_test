import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/admin";
import { ResultsHistory } from "@/components/ResultsHistory";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const session = await getSession("STUDENT");
  if (!session) redirect("/login");
  const student = await db.student.findUnique({ where: { id: session.userId }, select: { name: true } });
  if (!student) redirect("/login");
  return (
    <AppShell name={student.name}>
      <PageHeader title="My Results" subtitle="Every test you have completed, newest first." />
      <ResultsHistory />
    </AppShell>
  );
}
