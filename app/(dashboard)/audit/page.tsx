import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuditClient } from "./audit-client";

export default async function AuditPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "ADMIN") redirect("/");

  return <AuditClient />;
}
