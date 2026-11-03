// Módulos opcionais do WatchIT. O núcleo (links, rede, Wi-Fi, relatório, auditoria) está sempre ligado.
// Um módulo desligado some do menu, das contagens e para de sincronizar; código e dados permanecem.

export const MODULE_KEYS = ["telephony", "computers", "nvr"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleFlags = Record<ModuleKey, boolean>;

export const MODULE_LABELS: Record<ModuleKey, { label: string; description: string }> = {
  telephony: { label: "Telefonia", description: "Linhas e aparelhos, com sincronização do Miradore" },
  computers: { label: "Computadores", description: "Inventário de PCs sincronizado do Datto RMM" },
  nvr: { label: "NVR e câmeras", description: "Gravadores e canais sem gravação" },
};

/** Campo de SystemConfig que guarda cada flag. */
export const MODULE_COLUMN = {
  telephony: "moduleTelephony",
  computers: "moduleComputers",
  nvr: "moduleNvr",
} as const satisfies Record<ModuleKey, string>;

export const DEFAULT_MODULES: ModuleFlags = { telephony: false, computers: false, nvr: false };

interface ModuleRow {
  moduleTelephony?: boolean | null;
  moduleComputers?: boolean | null;
  moduleNvr?: boolean | null;
}

/** Converte uma linha de SystemConfig (ou null, se ainda não existir) em flags. */
export function modulesFromConfig(cfg: ModuleRow | null | undefined): ModuleFlags {
  return {
    telephony: cfg?.moduleTelephony ?? false,
    computers: cfg?.moduleComputers ?? false,
    nvr: cfg?.moduleNvr ?? false,
  };
}

// ── Interfaces escolhíveis ────────────────────────────────────────────────────

export const UI_KEYS = ["tower", "plantao", "nettop", "wtop"] as const;
export type UiKey = (typeof UI_KEYS)[number];
export const DEFAULT_UI: UiKey = "tower";

export const UI_LABELS: Record<UiKey, { label: string; description: string }> = {
  tower: { label: "TOWER/1 · fila de exceções", description: "Problemas no topo, links e unidades no meio. Padrão recomendado." },
  plantao: { label: "Plantão por unidade", description: "Uma coluna por unidade e busca universal." },
  nettop: { label: "NetTop · rede primeiro", description: "Failover, tráfego e Wi-Fi em destaque, com SLA do mês." },
  wtop: { label: "wtop · btop literal", description: "Painéis numerados, filtro por texto e paleta Ctrl+K." },
};

export function isUiKey(v: unknown): v is UiKey {
  return typeof v === "string" && (UI_KEYS as readonly string[]).includes(v);
}

/** Usuário (se permitido) > padrão do sistema > tower. */
export function resolveUi(opts: { userPref?: string | null; defaultUi?: string | null; allowUserUi?: boolean | null }): UiKey {
  const allow = opts.allowUserUi ?? true;
  if (allow && isUiKey(opts.userPref)) return opts.userPref;
  if (isUiKey(opts.defaultUi)) return opts.defaultUi;
  return DEFAULT_UI;
}

// ── Unidades ──────────────────────────────────────────────────────────────────

export const SITE_KEYS = ["BAR", "BOT", "ITA"] as const;
export type SiteKey = (typeof SITE_KEYS)[number];
export const SITE_NAMES: Record<SiteKey, string> = { BAR: "Barra", BOT: "Botafogo", ITA: "Itaguaí" };

export function isSiteKey(v: unknown): v is SiteKey {
  return typeof v === "string" && (SITE_KEYS as readonly string[]).includes(v);
}
