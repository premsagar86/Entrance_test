import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ResultView } from "@/components/ResultView";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: { id: string } }) {
  const session = await getSession("STUDENT");
  if (!session) redirect("/login");
  const student = await db.student.findUnique({ where: { id: session.userId }, select: { name: true } });
  if (!student) redirect("/login");
  return (
    <AppShell name={student.name}>
      <ResultView attemptId={params.id} />
    </AppShell>
  );
}
