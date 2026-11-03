/**
 * Cálculo de disponibilidade (SLA) — funções puras, sem acesso a banco.
 * Fuso fixo America/Sao_Paulo (UTC-3, sem horário de verão desde 2019).
 */

export const SP_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

export type DayState = "ok" | "partial" | "down" | "nodata" | "future";

export interface LinkEventLike {
  type: "UP" | "DOWN";
  timestamp: Date;
}

export interface DayAvailability {
  /** Dia do mês (1..31) no fuso America/Sao_Paulo. */
  day: number;
  state: DayState;
  downtimeSec: number;
}

export interface LinkAvailability {
  availabilityPct: number | null;
  downtimeSec: number;
  /** Tempo efetivamente observado no mês (até agora), em segundos. */
  observedSec: number;
  drops: number;
  longestDropSec: number;
  perDay: DayAvailability[];
}

export interface MonthRange {
  key: string; // YYYY-MM
  start: Date; // 00:00 do dia 1 em São Paulo
  end: Date; // 00:00 do dia 1 do mês seguinte
  days: number;
}

/** Limites do mês "YYYY-MM" em America/Sao_Paulo; null se inválido. */
export function monthRange(key: string): MonthRange | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
  const start = new Date(Date.UTC(y, mo - 1, 1) + SP_OFFSET_MS);
  const end = new Date(Date.UTC(y, mo, 1) + SP_OFFSET_MS);
  return { key, start, end, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) };
}

/** Chave YYYY-MM do instante, em America/Sao_Paulo. */
export function monthKeyOf(date: Date): string {
  const d = new Date(date.getTime() - SP_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface LinkAvailabilityOptions {
  /** Último evento anterior ao mês (define o estado inicial). */
  previousEvent?: LinkEventLike | null;
  /** A partir de quando o link é monitorado (ex.: createdAt). Antes disso = sem dado. */
  observedSince?: Date | null;
}

export function linkAvailability(
  events: LinkEventLike[],
  monthStart: Date,
  monthEnd: Date,
  now: Date,
  opts: LinkAvailabilityOptions = {},
): LinkAvailability {
  const startMs = monthStart.getTime();
  const endMs = monthEnd.getTime();
  const nowMs = now.getTime();
  const observedMs = Math.max(startMs, opts.observedSince?.getTime() ?? startMs);
  const windowEnd = Math.min(endMs, nowMs);

  // Intervalos de queda (clipados ao mês e a `now`).
  const intervals: Array<[number, number]> = [];
  let downSince: number | null = opts.previousEvent?.type === "DOWN" ? startMs : null;
  let drops = 0;
  const sorted = events
    .filter(e => e.timestamp.getTime() >= startMs && e.timestamp.getTime() < endMs)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const e of sorted) {
    const t = e.timestamp.getTime();
    if (e.type === "DOWN" && downSince === null) {
      downSince = t;
      drops++;
    } else if (e.type === "UP" && downSince !== null) {
      intervals.push([downSince, t]);
      downSince = null;
    }
  }
  if (downSince !== null) intervals.push([downSince, windowEnd]);

  const clipped = intervals
    .map(([a, b]) => [Math.max(a, observedMs), Math.min(b, windowEnd)] as [number, number])
    .filter(([a, b]) => b > a);

  const days = Math.round((endMs - startMs) / DAY_MS);
  const perDay: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    const ds = startMs + i * DAY_MS;
    const de = ds + DAY_MS;
    const obsStart = Math.max(ds, observedMs);
    const obsEnd = Math.min(de, nowMs);
    let state: DayState;
    let downMs = 0;
    if (ds >= nowMs) state = "future";
    else if (obsEnd <= obsStart) state = "nodata";
    else {
      for (const [a, b] of clipped) {
        const o = Math.min(b, obsEnd) - Math.max(a, obsStart);
        if (o > 0) downMs += o;
      }
      state = downMs === 0 ? "ok" : downMs >= obsEnd - obsStart - 999 ? "down" : "partial";
    }
    perDay.push({ day: i + 1, state, downtimeSec: Math.round(downMs / 1000) });
  }

  const observedTotal = Math.max(0, windowEnd - observedMs);
  const downMsTotal = clipped.reduce((s, [a, b]) => s + (b - a), 0);
  const longest = clipped.reduce((m, [a, b]) => Math.max(m, b - a), 0);

  return {
    availabilityPct:
      observedTotal > 0 ? Math.max(0, ((observedTotal - downMsTotal) / observedTotal) * 100) : null,
    downtimeSec: Math.round(downMsTotal / 1000),
    observedSec: Math.round(observedTotal / 1000),
    drops,
    longestDropSec: Math.round(longest / 1000),
    perDay,
  };
}

/**
 * Disponibilidade de dispositivo/AP: proporção de checks online (mesmo critério
 * do relatório por dispositivo). Sem checks = sem dado (null), nunca 100%.
 */
export function deviceAvailability(total: number, online: number): number | null {
  return total > 0 ? (online / total) * 100 : null;
}

/** Disponibilidade agregada (ponderada pelo tempo observado) de vários links. */
export function aggregateAvailability(
  items: Array<{ downtimeSec: number; observedSec: number }>,
): number | null {
  const obs = items.reduce((s, i) => s + i.observedSec, 0);
  if (obs <= 0) return null;
  const down = items.reduce((s, i) => s + i.downtimeSec, 0);
  return Math.max(0, ((obs - down) / obs) * 100);
}
