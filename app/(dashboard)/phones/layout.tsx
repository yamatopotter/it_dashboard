import { redirect } from "next/navigation";
import { getModules } from "@/lib/module-config";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const modules = await getModules();
  if (!modules.telephony) redirect("/");
  return <>{children}</>;
}
