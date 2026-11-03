import { db } from "@/lib/db";
import { resolveUi, type UiKey } from "@/lib/modules";

export { UI_ROUTE } from "@/lib/ui-route";

/** Interface efetiva do usuário: preferência (se permitida) > padrão do sistema > tower. */
export async function getResolvedUi(userId?: string | null): Promise<UiKey> {
  const cfg = await db.systemConfig.findUnique({ where: { id: 1 } });
  const user = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { uiPreference: true } })
    : null;
  return resolveUi({
    userPref: user?.uiPreference ?? null,
    defaultUi: cfg?.defaultUi ?? null,
    allowUserUi: cfg?.allowUserUi ?? true,
  });
}
