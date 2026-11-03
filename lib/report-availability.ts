// Relatório mensal de disponibilidade: links (LinkEvent) + dispositivos de rede/Wi-Fi (StatusHistory).
import { db } from "@/lib/db";
import { SITE_KEYS, SITE_NAMES } from "@/lib/modules";
import {
  linkAvailability,
  deviceAvailability,
  aggregateAvailability,
  type DayAvailability,
} from "@/lib/sla";
import type { DeviceType } from "@prisma/client";

/** Tipos de dispositivo no escopo (rede e Wi-Fi). NVR/câmeras ficam fora. */
export const NETWORK_DEVICE_TYPES: DeviceType[] = ["MIKROTIK", "UNIFI_AP", "OMADA_AP", "OTHER"];

export const DEFAULT_TARGET = 99.5;

export interface AvailabilityLinkRow {
  id: string;
  name: string;
  site: string | null;
  availabilityPct: number | null;
  downtimeSec: number;
  drops: number;
  longestDropSec: number;
  perDay: DayAvailability[];
  metTarget: boolean | null; // null = sem dado
}

export interface AvailabilityUnitRow {
  site: string; // BAR | BOT | ITA | NONE
  name: string;
  linkCount: number;
  availabilityPct: number | null;
  downtimeSec: number;
  drops: number;
  linksBelowTarget: number;
  metTarget: boolean | null;
}

export interface AvailabilityDeviceRow {
  id: string;
  name: string;
  type: DeviceType;
  site: string | null;
  availabilityPct: number;
  totalChecks: number;
}

export interface AvailabilityReport {
  month: string;
  from: string;
  to: string;
  days: number;
  target: number;
  generatedAt: string;
  units: AvailabilityUnitRow[];
  links: AvailabilityLinkRow[];
  devices: { worst: AvailabilityDeviceRow[]; withoutData: number };
}

interface MonthBounds { key: string; start: Date; end: Date; days: number }

export async function buildAvailabilityReport(
  month: MonthBounds,
  target: number,
  now: Date,
): Promise<AvailabilityReport> {
  const histEnd = new Date(Math.min(month.end.getTime(), now.getTime()));

  const [links, events, previous, devices, grouped] = await Promise.all([
    db.link.findMany({ select: { id: true, name: true, site: true, createdAt: true }, orderBy: { name: "asc" } }),
    db.linkEvent.findMany({
      where: { timestamp: { gte: month.start, lt: month.end } },
      select: { linkId: true, type: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    }),
    // último evento anterior ao mês, por link (uma consulta)
    db.$queryRaw<Array<{ linkId: string; type: "UP" | "DOWN"; timestamp: Date }>>`
      SELECT DISTINCT ON ("linkId") "linkId", "type"::text AS type, "timestamp"
      FROM "LinkEvent"
      WHERE "timestamp" < ${month.start}
      ORDER BY "linkId", "timestamp" DESC
    `,
    db.device.findMany({
      where: { type: { in: NETWORK_DEVICE_TYPES } },
      select: { id: true, name: true, type: true, site: true },
    }),
    histEnd > month.start
      ? db.statusHistory.groupBy({
          by: ["deviceId", "isOnline"],
          where: {
            timestamp: { gte: month.start, lt: histEnd },
            device: { type: { in: NETWORK_DEVICE_TYPES } },
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ deviceId: string; isOnline: boolean; _count: { _all: number } }>),
  ]);

  const eventsByLink = new Map<string, Array<{ type: "UP" | "DOWN"; timestamp: Date }>>();
  for (const e of events) {
    const list = eventsByLink.get(e.linkId) ?? [];
    list.push({ type: e.type as "UP" | "DOWN", timestamp: e.timestamp });
    eventsByLink.set(e.linkId, list);
  }
  const prevByLink = new Map(previous.map(p => [p.linkId, p]));

  const linkRows: Array<AvailabilityLinkRow & { observedSec: number }> = links.map(l => {
    const r = linkAvailability(eventsByLink.get(l.id) ?? [], month.start, month.end, now, {
      previousEvent: prevByLink.get(l.id) ?? null,
      observedSince: l.createdAt,
    });
    return {
      id: l.id,
      name: l.name,
      site: l.site,
      availabilityPct: r.availabilityPct,
      downtimeSec: r.downtimeSec,
      drops: r.drops,
      longestDropSec: r.longestDropSec,
      perDay: r.perDay,
      observedSec: r.observedSec,
      metTarget: r.availabilityPct == null ? null : r.availabilityPct >= target,
    };
  });

  const siteOf = (s: string | null) => ((SITE_KEYS as readonly string[]).includes(s ?? "") ? (s as string) : "NONE");
  const unitKeys = [...SITE_KEYS, "NONE"] as string[];
  const units: AvailabilityUnitRow[] = unitKeys
    .map(key => {
      const rows = linkRows.filter(r => siteOf(r.site) === key);
      const pct = aggregateAvailability(rows);
      return {
        site: key,
        name: key === "NONE" ? "Sem unidade" : SITE_NAMES[key as keyof typeof SITE_NAMES],
        linkCount: rows.length,
        availabilityPct: pct,
        downtimeSec: rows.reduce((s, r) => s + r.downtimeSec, 0),
        drops: rows.reduce((s, r) => s + r.drops, 0),
        linksBelowTarget: rows.filter(r => r.metTarget === false).length,
        metTarget: pct == null ? null : pct >= target,
      };
    })
    .filter(u => u.linkCount > 0 || u.site !== "NONE");

  const counts = new Map<string, { total: number; online: number }>();
  for (const g of grouped) {
    const c = counts.get(g.deviceId) ?? { total: 0, online: 0 };
    c.total += g._count._all;
    if (g.isOnline) c.online += g._count._all;
    counts.set(g.deviceId, c);
  }
  const scored: AvailabilityDeviceRow[] = [];
  let withoutData = 0;
  for (const d of devices) {
    const c = counts.get(d.id);
    const pct = c ? deviceAvailability(c.total, c.online) : null;
    if (pct == null) { withoutData++; continue; }
    scored.push({ id: d.id, name: d.name, type: d.type, site: d.site, availabilityPct: pct, totalChecks: c!.total });
  }
  scored.sort((a, b) => a.availabilityPct - b.availabilityPct);

  return {
    month: month.key,
    from: month.start.toISOString(),
    to: month.end.toISOString(),
    days: month.days,
    target,
    generatedAt: now.toISOString(),
    units,
    links: linkRows.map(({ observedSec: _o, ...rest }) => { void _o; return rest; }),
    devices: { worst: scored.slice(0, 10), withoutData },
  };
}
