import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { db } from "@/lib/db";
import { isSetupCompleteNode } from "@/lib/setup-node";
import { getModules } from "@/lib/module-config";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSetupCompleteNode()) redirect("/setup");

  const session = await auth();
  if (!session) redirect("/login");

  const userRole = (session.user as { role?: string })?.role ?? "VIEWER";

  const [modules, devices, links] = await Promise.all([
    getModules().catch(() => ({ telephony: false, computers: false, nvr: false })),
    db.device.findMany({ select: { id: true, currentStatus: { select: { isOnline: true } } } }),
    db.link.findMany({ select: { id: true, isOnline: true } }),
  ]);

  const initialCounts = {
    devicesTotal: devices.length,
    devicesOffline: devices.filter((d) => !d.currentStatus?.isOnline).length,
    linksOnline: links.filter((l) => l.isOnline).length,
    linksTotal: links.length,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userName={session.user?.name ?? ""} userRole={userRole} initialCounts={initialCounts} modules={modules} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
