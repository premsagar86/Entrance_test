import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { StudentDashboard } from "@/components/StudentTests";

export const dynamic = "force-dynamic";

export default async function StudentDashboardPage() {
  // The middleware only checks the cookie exists; validate it for real here.
  const session = await getSession("STUDENT");
  if (!session) redirect("/login");
  const student = await db.student.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true, rollNo: true, batch: true },
  });
  if (!student) redirect("/login");

  return (
    <AppShell name={student.name}>
      <StudentDashboard profile={student} />
    </AppShell>
  );
}
