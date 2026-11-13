import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TestRunner } from "@/components/TestRunner";

export const dynamic = "force-dynamic";

export default async function TestPage({ params }: { params: { id: string } }) {
  if (!(await getSession("STUDENT"))) redirect("/login");
  return <TestRunner testId={params.id} />;
}
