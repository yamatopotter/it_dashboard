import type { UiKey } from "@/lib/modules";

/** Rota de cada interface (sem dependências de servidor, usável em componentes cliente). */
export const UI_ROUTE: Record<UiKey, string> = {
  tower: "/tower",
  plantao: "/plantao",
  nettop: "/nettop",
  wtop: "/wtop",
};
