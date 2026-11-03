"use client";
import { useNow } from "@/hooks/use-now";
import { fmtAge, fmtClock } from "@/lib/tui-format";
import type { TowerHealth } from "@/lib/tower-types";
import { SITE_KEYS, SITE_NAMES, type SiteKey } from "@/lib/modules";

export type SiteFilter = "ALL" | SiteKey;

interface TopBarProps {
  health: TowerHealth | null;
  ageSec: number;
  frozen: boolean;
  site: SiteFilter;
  onSite: (s: SiteFilter) => void;
  alerts: number;
}

/** Barra de topo: relógio, worker/dados, chips de unidade (0-3) e contador de alertas. */
export function TopBar({ health, ageSec, frozen, site, onSite, alerts }: TopBarProps) {
  const now = useNow();
  const stale = health?.workerStatus === "stale";
  const workerCls = !health || health.workerStatus === "unknown" ? "dim" : stale ? "crit" : "ok";
  const workerTxt = !health ? "—" : health.workerStatus === "unknown" ? "sem dado" : fmtAge(health.workerAgeSec != null ? health.workerAgeSec + ageSec : null);
  const chips: [string, SiteFilter, string][] = [
    ["0", "ALL", "todas"],
    ...SITE_KEYS.map((k, i) => [String(i + 1), k, k] as [string, SiteFilter, string]),
  ];
  return (
    <header className="topbar">
      <span className="brand">WatchIT</span>
      <span className="clock">{now ? fmtClock(new Date(now)) : "--"}</span>
      <span>
        worker <span className={workerCls}>{stale ? "✖" : workerCls === "ok" ? "●" : "◌"}</span> {workerTxt}
      </span>
      <span>
        dados <span className={frozen ? "crit blink" : "ok"}>{frozen ? "✖" : "●"}</span> {fmtAge(ageSec)}
      </span>
      <span className="chips" role="group" aria-label="Unidade">
        {chips.map(([k, v, label]) => (
          <button
            key={v}
            type="button"
            className="chip"
            aria-pressed={site === v}
            title={v === "ALL" ? "Todas as unidades" : SITE_NAMES[v]}
            onClick={() => onSite(v)}
          >
            <kbd>{k}</kbd> {label}
          </button>
        ))}
      </span>
      <span className="spacer" />
      <span className="alertcount" aria-live="polite">
        {alerts > 0 ? `⚠ ${alerts} ${alerts === 1 ? "aberto" : "abertos"}` : ""}
      </span>
    </header>
  );
}
