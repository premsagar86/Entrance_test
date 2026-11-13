import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { AdminSidebar } from "@/components/AdminNav";
import { Announcements } from "@/components/Announcements";
import { ToastProvider } from "@/components/Toast";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  // Real session check (middleware only checks the cookie exists). APIs re-check on every call.
  const session = await getSession("ADMIN");
  if (!session) redirect("/admin/login");
  const admin = await db.admin.findUnique({ where: { id: session.userId }, select: { name: true } });
  if (!admin) redirect("/admin/login");

  return (
    <ToastProvider>
    <AdminSidebar adminName={admin.name}>
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-8 lg:py-8">
        <Announcements />
        {children}
      </main>
    </AdminSidebar>
    </ToastProvider>
  );
}
