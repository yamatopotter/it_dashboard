// Dados extras do NetTop em ?mock=1: mais APs (UniFi + Omada) e um relatório mensal de SLA determinístico.
import type { TowerAp, TowerSnapshot } from "@/lib/tower-types";
import type { AvailabilityReport } from "@/lib/report-availability";
import { monthKeyOf, monthRange, type DayAvailability, type DayState } from "@/lib/sla";
import { buildMockSnapshot } from "@/components/tower/mock-snapshot";

function ap(id: string, name: string, site: "BAR" | "BOT" | "ITA", vendor: "unifi" | "omada", i: number, extra: Partial<TowerAp> = {}): TowerAp {
  return {
    id, name, site, vendor, state: "ok",
    clients: 3 + ((i * 7) % 27),
    channel: i % 2 ? `${36 + 4 * (i % 4)}/5G` : `${1 + 5 * (i % 3)}/2G`,
    utilPct: 15 + ((i * 17) % 50),
    signalDbm: -(55 + ((i * 3) % 15)),
    offlineForSec: null,
    ...extra,
  };
}

export function buildNettopMockSnapshot(now: Date = new Date()): TowerSnapshot {
  const base = buildMockSnapshot(now);
  const extra: TowerAp[] = [
    ap("ap-bar-2", "U6-Pro-Sala", "BAR", "unifi", 2),
    ap("ap-bar-3", "U6-Lite-Rec", "BAR", "unifi", 3, { utilPct: null, signalDbm: null }),
    ...Array.from({ length: 5 }, (_, k) => ap(`ap-bot-${k}`, `EAP225-BOT-${k + 1}`, "BOT", "omada", k + 4)),
    ...Array.from({ length: 4 }, (_, k) => ap(`ap-ita-${k}`, `EAP225-ITA-${k + 1}`, "ITA", "omada", k + 9)),
  ];
  const aps = [...base.aps, ...extra];
  const sites = base.sites.map((s) => {
    const mine = aps.filter((a) => a.site === s.site);
    return {
      ...s,
      apsTotal: mine.length,
      apsOnline: mine.filter((a) => a.state === "ok").length,
      clients: mine.length ? mine.reduce((n, a) => n + (a.clients ?? 0), 0) : null,
    };
  });
  // O snapshot real não traz histórico de tráfego por link (spark vazio); o mock reflete isso.
  const links = base.links.map((l) => ({ ...l, spark: [] }));
  return { ...base, links, aps, sites, monitored: { total: base.monitored.total + extra.length, online: base.monitored.online + extra.length } };
}

/** Relatório de SLA do mês com alguns dias parciais/fora/sem dado e o futuro vazio (mesmo shape de GET /api/reports). */
export function buildMockReport(snap: TowerSnapshot, now: Date = new Date(), monthKey?: string): AvailabilityReport {
  const key = monthKey ?? monthKeyOf(now);
  const range = monthRange(key)!;
  const sp = new Date(now.getTime() - 3 * 3_600_000);
  const today = key === monthKeyOf(now) ? sp.getUTCDate() : range.days;
  const links = snap.links.map((l, li) => {
    const perDay: DayAvailability[] = Array.from({ length: range.days }, (_, i) => {
      const day = i + 1;
      let state: DayState = day > today ? "future" : "ok";
      let downtimeSec = 0;
      if (state === "ok" && l.id === "ita-vivo" && day === today) { state = "down"; downtimeSec = 5400; }
      if (state === "ok" && (day * 7 + li * 3) % 11 === 0) { state = "partial"; downtimeSec = 600; }
      if (state === "ok" && li === 1 && day === 1) state = "nodata";
      return { day, state, downtimeSec };
    });
    const downtimeSec = perDay.reduce((n, d) => n + d.downtimeSec, 0);
    const pct = Math.round((1 - downtimeSec / (Math.max(1, today) * 86400)) * 10000) / 100;
    return {
      id: l.id, name: l.name, site: l.site, availabilityPct: pct, downtimeSec,
      drops: perDay.filter((d) => d.state === "partial" || d.state === "down").length,
      longestDropSec: Math.max(0, ...perDay.map((d) => d.downtimeSec)), perDay, metTarget: pct >= 99.5,
    };
  });
  return {
    month: key, from: range.start.toISOString(), to: range.end.toISOString(), days: range.days, target: 99.5,
    generatedAt: now.toISOString(), units: [], links, devices: { worst: [], withoutData: 0 },
  };
}
