// Monta o snapshot único (TowerSnapshot) consumido pelas interfaces TOWER/1, Plantão, NetTop e wtop.
// Núcleo apenas: links, rede (Mikrotik/switches/outros) e Wi-Fi (UniFi/Omada). NVR/câmeras ficam de fora.
// Consultas fixas (sem N+1): dispositivos, links, sparks (date_bin), falhas consecutivas, eventos de
// link 7d, transições de status 24h e heartbeat.
//
// Simplificações: links não têm histórico de tráfego no banco, então `spark` de link é [];
// o "uso sustentado" do link vem só do `usagePct` atual (ver lib/problems.ts).

import { db } from "@/lib/db";
import { getDeviceStatusEvents } from "@/lib/incident-detection";
import { analyzeProblems, type ProblemDeviceInput, type ProblemLinkInput } from "@/lib/problems";
import { isSiteKey, SITE_KEYS, SITE_NAMES, type SiteKey } from "@/lib/modules";
import type {
  DeviceState, TowerAp, TowerDevice, TowerEvent, TowerLink, TowerSiteSummary, TowerSnapshot,
} from "@/lib/tower-types";

const HOUR = 3_600_000;
const EXCLUDED_TYPES = ["DVR", "CAMERA"] as const;
const MAX_EVENTS = 40;

function siteOf(v: string | null | undefined): SiteKey | null {
  return isSiteKey(v) ? v : null;
}

interface FailRow { deviceId: string; fails: number; since: Date }
interface SparkRow { id: string; bucket: Date; v: number | null }

/** Disponibilidade % do link nas últimas 24h a partir dos eventos UP/DOWN. */
export function linkAvailability(
  events: { type: "UP" | "DOWN"; timestamp: Date }[],
  isOnlineNow: boolean,
  now: number,
): number | null {
  const start = now - 24 * HOUR;
  const inWin = events.filter((e) => e.timestamp.getTime() >= start);
  const before = events.filter((e) => e.timestamp.getTime() < start);
  let up = before.length ? before[before.length - 1].type === "UP" : inWin.length ? inWin[0].type === "DOWN" : isOnlineNow;
  let cursor = start;
  let upMs = 0;
  for (const e of inWin) {
    const t = e.timestamp.getTime();
    if (up) upMs += t - cursor;
    cursor = t;
    up = e.type === "UP";
  }
  if (up) upMs += now - cursor;
  return Math.round((upMs / (24 * HOUR)) * 1000) / 10;
}

export async function buildTowerSnapshot(now: Date = new Date()): Promise<TowerSnapshot> {
  const nowMs = now.getTime();
  const since24h = new Date(nowMs - 24 * HOUR);
  const since7d = new Date(nowMs - 7 * 24 * HOUR);

  const [deviceRows, linkRows, failRows, sparkRows, linkEvents, statusEvents, heartbeat, totalChecks, onlineChecks] =
    await Promise.all([
      db.device.findMany({
        where: { type: { notIn: [...EXCLUDED_TYPES] } },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, ip: true, type: true, site: true, alertThreshold: true,
          maintenanceUntil: true, offlineAcknowledgedAt: true, offlineAcknowledgedBy: true, offlineAcknowledgedNote: true,
          currentStatus: { select: { isOnline: true, pingMs: true, cpuLoad: true, checkedAt: true, unifiData: true, omadaData: true } },
        },
      }),
      db.link.findMany({
        orderBy: { name: "asc" },
        include: { mikrotikDevice: { select: { name: true } } },
      }),
      // Falhas consecutivas: linhas offline posteriores ao último "online" (janela 24h).
      db.$queryRaw<FailRow[]>`
        SELECT h."deviceId" AS "deviceId", COUNT(*)::int AS fails, MIN(h."timestamp") AS since
        FROM "StatusHistory" h
        LEFT JOIN (
          SELECT "deviceId", MAX("timestamp") AS last_ok
          FROM "StatusHistory" WHERE "isOnline" = true AND "timestamp" >= ${since24h}
          GROUP BY "deviceId"
        ) o ON o."deviceId" = h."deviceId"
        WHERE h."isOnline" = false AND h."timestamp" >= ${since24h}
          AND (o.last_ok IS NULL OR h."timestamp" > o.last_ok)
        GROUP BY h."deviceId"
      `,
      // Sparklines de todos os dispositivos numa só query: até 48 baldes de 30 min.
      db.$queryRaw<SparkRow[]>`
        SELECT "deviceId" AS id,
               date_bin('30 minutes', "timestamp", TIMESTAMP '2001-01-01') AS bucket,
               COALESCE(AVG("pingMs") FILTER (WHERE "isOnline"), 0)::float AS v
        FROM "StatusHistory"
        WHERE "timestamp" >= ${since24h}
        GROUP BY "deviceId", bucket
        ORDER BY "deviceId", bucket
      `,
      db.linkEvent.findMany({
        where: { timestamp: { gte: since7d } },
        orderBy: { timestamp: "asc" },
        select: { id: true, linkId: true, type: true, timestamp: true },
      }),
      getDeviceStatusEvents(since24h),
      db.workerHeartbeat.findUnique({ where: { id: 1 } }),
      db.statusHistory.count({ where: { timestamp: { gte: since24h } } }),
      db.statusHistory.count({ where: { timestamp: { gte: since24h }, isOnline: true } }),
    ]);

  const fails = new Map(failRows.map((r) => [r.deviceId, r]));
  const sparks = new Map<string, number[]>();
  for (const r of sparkRows) {
    const arr = sparks.get(r.id) ?? [];
    arr.push(Math.round(Number(r.v ?? 0)));
    sparks.set(r.id, arr);
  }
  const eventsByLink = new Map<string, typeof linkEvents>();
  for (const e of linkEvents) {
    const arr = eventsByLink.get(e.linkId) ?? [];
    arr.push(e);
    eventsByLink.set(e.linkId, arr);
  }

  // ── Links ──────────────────────────────────────────────────────────────────
  const links: TowerLink[] = [];
  const problemLinks: ProblemLinkInput[] = [];
  for (const l of linkRows) {
    const evs = eventsByLink.get(l.id) ?? [];
    const downs = evs.filter((e) => e.type === "DOWN");
    const lastDown = downs.length ? downs[downs.length - 1].timestamp : null;
    const downSince = !l.isOnline ? (lastDown ?? l.lastEventAt ?? null) : null;
    const usagePct =
      l.isOnline && l.contractedDownloadBps && l.downloadBps != null
        ? Math.min(100, (l.downloadBps / l.contractedDownloadBps) * 100)
        : null;
    const site = siteOf(l.site);
    links.push({
      id: l.id, name: l.name, site, isOnline: l.isOnline,
      downForSec: downSince ? Math.max(0, Math.round((nowMs - downSince.getTime()) / 1000)) : null,
      contractedDownBps: l.contractedDownloadBps, contractedUpBps: l.contractedUploadBps,
      downBps: l.downloadBps, upBps: l.uploadBps, latencyMs: l.latencyMs,
      usagePct: usagePct != null ? Math.round(usagePct * 10) / 10 : null,
      spark: [],
      gatewayName: l.mikrotikDevice?.name ?? null,
      mikrotikInterface: l.mikrotikInterface,
      acknowledged: !!l.offlineAcknowledgedAt && !l.isOnline,
      ackBy: l.offlineAcknowledgedBy, ackNote: l.offlineAcknowledgedNote,
      maintenanceUntil: l.maintenanceUntil?.toISOString() ?? null,
      drops7d: downs.length,
      availability24h: linkAvailability(evs, l.isOnline, nowMs),
      lastDownAt: lastDown?.toISOString() ?? null,
      description: l.description,
    });
    problemLinks.push({
      id: l.id, name: l.name, site, isOnline: l.isOnline, usagePct, downSince,
      maintenanceUntil: l.maintenanceUntil,
      ackAt: l.offlineAcknowledgedAt, ackBy: l.offlineAcknowledgedBy, ackNote: l.offlineAcknowledgedNote,
    });
  }

  // ── Dispositivos e APs ─────────────────────────────────────────────────────
  const problemDevices: ProblemDeviceInput[] = deviceRows.map((d) => {
    const f = fails.get(d.id);
    const isOnline = d.currentStatus ? d.currentStatus.isOnline : null;
    return {
      id: d.id, name: d.name, kind: d.type === "UNIFI_AP" || d.type === "OMADA_AP" ? "AP" : "DISP",
      type: d.type, site: siteOf(d.site), isOnline,
      consecutiveFailures: isOnline === false ? (f?.fails ?? 1) : 0,
      alertThreshold: d.alertThreshold,
      offlineSince: isOnline === false ? (f?.since ?? d.currentStatus?.checkedAt ?? null) : null,
      maintenanceUntil: d.maintenanceUntil,
      ackAt: d.offlineAcknowledgedAt, ackBy: d.offlineAcknowledgedBy, ackNote: d.offlineAcknowledgedNote,
    };
  });

  const { problems, devices: analysis } = analyzeProblems({ links: problemLinks, devices: problemDevices, now });

  const devices: TowerDevice[] = [];
  const aps: TowerAp[] = [];
  for (let i = 0; i < deviceRows.length; i++) {
    const d = deviceRows[i];
    const p = problemDevices[i];
    const a = analysis.get(d.id);
    const state: DeviceState = a?.state ?? "unk";
    const offlineForSec = p.offlineSince ? Math.max(0, Math.round((nowMs - p.offlineSince.getTime()) / 1000)) : null;
    const site = p.site;
    if (p.kind === "AP") {
      const raw = (d.type === "UNIFI_AP" ? d.currentStatus?.unifiData : d.currentStatus?.omadaData) as
        | { totalClients?: number; ssids?: { channel?: number | string | null }[] }
        | null | undefined;
      const ch = raw?.ssids?.[0]?.channel;
      aps.push({
        id: d.id, name: d.name, site, vendor: d.type === "UNIFI_AP" ? "unifi" : "omada", state,
        clients: typeof raw?.totalClients === "number" ? raw.totalClients : null,
        channel: ch != null ? String(ch) : null,
        utilPct: null, signalDbm: null, offlineForSec,
      });
    } else {
      devices.push({
        id: d.id, name: d.name, ip: d.ip, type: d.type, site, state,
        isOnline: p.isOnline, responseMs: d.currentStatus?.pingMs ?? null, cpuPct: d.currentStatus?.cpuLoad ?? null,
        offlineForSec, consecutiveFailures: p.consecutiveFailures,
        acknowledged: !!d.offlineAcknowledgedAt && p.isOnline === false,
        ackBy: d.offlineAcknowledgedBy, ackNote: d.offlineAcknowledgedNote,
        maintenanceUntil: d.maintenanceUntil?.toISOString() ?? null,
        suppressedByLinkId: a?.suppressedByLinkId ?? null,
        spark: (sparks.get(d.id) ?? []).slice(-48),
      });
    }
  }

  // ── Unidades ───────────────────────────────────────────────────────────────
  const siteList: (SiteKey | null)[] = [...SITE_KEYS];
  const hasNull = [...devices, ...aps, ...links].some((x) => x.site === null);
  if (hasNull) siteList.push(null);
  const sites: TowerSiteSummary[] = siteList.map((s) => {
    const sd = devices.filter((d) => d.site === s);
    const sa = aps.filter((a) => a.site === s);
    const sl = links.filter((l) => l.site === s);
    const all = [...sd, ...sa];
    const withClients = sa.filter((a) => a.clients != null);
    return {
      site: s,
      name: s ? SITE_NAMES[s] : "?",
      devicesTotal: sd.length,
      devicesOnline: sd.filter((d) => d.isOnline === true).length,
      devicesOffline: sd.filter((d) => d.state === "crit" || d.state === "ack").length,
      devicesSuppressed: all.filter((d) => d.state === "sup").length,
      apsTotal: sa.length,
      apsOnline: sa.filter((a) => a.state === "ok" || a.state === "maint").length,
      linksTotal: sl.length,
      linksOnline: sl.filter((l) => l.isOnline).length,
      clients: withClients.length ? withClients.reduce((n, a) => n + (a.clients ?? 0), 0) : null,
      dots: all.map((d) => d.state),
    };
  });

  // ── Eventos recentes (devices + links, estilo /api/timeline) ───────────────
  const events: TowerEvent[] = [];
  const deviceById = new Map(deviceRows.map((d) => [d.id, d]));
  for (const [deviceId, rows] of statusEvents) {
    const d = deviceById.get(deviceId);
    if (!d) continue;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].isOnline === rows[i - 1].isOnline) continue;
      const off = !rows[i].isOnline;
      events.push({
        id: `dev-${deviceId}-${rows[i].timestamp.getTime()}`,
        at: rows[i].timestamp.toISOString(),
        severity: off ? "warn" : "ok",
        site: siteOf(d.site),
        text: `${d.name} ${off ? "ficou offline" : "voltou"}`,
      });
    }
  }
  const linkById = new Map(linkRows.map((l) => [l.id, l]));
  for (const e of linkEvents) {
    if (e.timestamp < since24h) continue;
    const l = linkById.get(e.linkId);
    if (!l) continue;
    events.push({
      id: `link-${e.id}`,
      at: e.timestamp.toISOString(),
      severity: e.type === "DOWN" ? "crit" : "ok",
      site: siteOf(l.site),
      text: `Link ${l.name} ${e.type === "DOWN" ? "caiu" : "voltou"}`,
    });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  // ── Health ─────────────────────────────────────────────────────────────────
  const ageSec = heartbeat ? Math.max(0, Math.round((nowMs - heartbeat.seenAt.getTime()) / 1000)) : null;
  const total = devices.length + aps.length + links.length;
  const online =
    devices.filter((d) => d.isOnline === true).length +
    aps.filter((a) => a.state === "ok" || a.state === "maint").length +
    links.filter((l) => l.isOnline).length;

  return {
    health: {
      workerStatus: ageSec == null ? "unknown" : ageSec < 180 ? "ok" : "stale",
      workerAgeSec: ageSec,
      generatedAt: now.toISOString(),
      uptimePct24h: totalChecks > 0 ? Math.round((onlineChecks / totalChecks) * 1000) / 10 : null,
    },
    problems, links, devices, aps, sites,
    events: events.slice(0, MAX_EVENTS),
    monitored: { total, online },
  };
}
