import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { DEFAULT_UI, isUiKey } from "@/lib/modules";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = (session.user as { id?: string }).id;
  const username = session.user.name;

  const user = await db.user.findUnique({
    where: userId ? { id: userId } : { username: username ?? "" },
    select: { id: true, username: true, role: true, totpEnabled: true, createdAt: true, uiPreference: true },
  });
  if (!user) redirect("/login");

  const cfg = await db.systemConfig.findUnique({ where: { id: 1 } });
  const defaultUi = isUiKey(cfg?.defaultUi) ? cfg.defaultUi : DEFAULT_UI;

  return <ProfileClient user={user} allowUserUi={cfg?.allowUserUi ?? true} defaultUi={defaultUi} />;
}
