// Formatação e glifos compartilhados pelas interfaces TUI (TOWER/1, Plantão, NetTop, wtop).
import type { DeviceState, Severity } from "@/lib/tower-types";

export type Level = "ok" | "warn" | "crit";

/** Segundos em texto curto: 14m22s, 1h40m, 3d 4h. */
export function fmtAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.floor(sec));
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

/** Nível de uso: >=90 crit, >=70 warn, resto ok. */
export function pctLevel(pct: number | null | undefined): Level {
  if (pct == null) return "ok";
  return pct >= 90 ? "crit" : pct >= 70 ? "warn" : "ok";
}

/** Glifos de estado: nunca só cor. */
export const GLYPH = { ok: "●", warn: "▲", crit: "✖", ack: "░", unk: "◌", sup: "◌", maint: "░", info: "·" } as const;
export type GlyphKey = keyof typeof GLYPH;

export const STATE_LABEL: Record<DeviceState, string> = {
  ok: "online",
  crit: "offline",
  ack: "reconhecido",
  maint: "em manutenção",
  sup: "suprimido (sem resposta por causa do link)",
  unk: "sem dado",
};

export const SEVERITY_LABEL: Record<Severity, string> = { crit: "CRIT", warn: "WARN", ack: "ACK", info: "INFO" };

/** Ordem da fila de problemas: gravidade e depois idade (mais antigo primeiro). */
export const SEVERITY_ORDER: Record<Severity, number> = { crit: 0, warn: 1, info: 2, ack: 3 };

/** Bits por segundo em Mbps, sem casas para valores >= 10. */
export function fmtMbps(bps: number | null | undefined): string {
  if (bps == null) return "—";
  const m = bps / 1_000_000;
  return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10}M`;
}

/** Hora local HH:MM de um ISO. */
export function fmtHM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DOW = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Relógio "ter 03/11 14:32:07". */
export function fmtClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DOW[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
