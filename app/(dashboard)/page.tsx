import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getResolvedUi, UI_ROUTE } from "@/lib/ui-pref";

export const dynamic = "force-dynamic";

export default async function DashboardRoot() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  redirect(UI_ROUTE[await getResolvedUi(userId)]);
}
