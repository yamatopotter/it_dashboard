// Snapshot de exemplo (?mock=1) com os dados dos protótipos: Itaguaí com o link Vivo caído e 12 dependentes.
import type { DeviceState, TowerAp, TowerDevice, TowerLink, TowerSnapshot } from "@/lib/tower-types";
import { SITE_NAMES, type SiteKey } from "@/lib/modules";

/** Série determinística (sem Math.random) para sparklines estáveis. */
function series(seed: number, n: number, base: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const v = base + amp * (0.55 * Math.sin((i + seed) / 3.1) + 0.3 * Math.sin((i * seed) / 7.7) + 0.15 * Math.cos(i / 1.7 + seed));
    return Math.max(0, Math.round(v));
  });
}
const M = 1_000_000;

function link(p: Partial<TowerLink> & Pick<TowerLink, "id" | "name" | "site">, capM: number, downM: number, upM: number, spark: number[]): TowerLink {
  const online = p.isOnline ?? true;
  return {
    isOnline: online,
    downForSec: null,
    contractedDownBps: capM * M,
    contractedUpBps: Math.round(capM / 3) * M,
    downBps: online ? downM * M : null,
    upBps: online ? upM * M : null,
    latencyMs: online ? 10 : null,
    usagePct: online ? Math.round((downM / capM) * 100) : null,
    spark: spark.map((v) => v * M),
    gatewayName: null,
    mikrotikInterface: null,
    acknowledged: false,
    ackBy: null,
    ackNote: null,
    maintenanceUntil: null,
    drops7d: 0,
    availability24h: 99.9,
    lastDownAt: null,
    description: null,
    ...p,
  };
}

const ITA_DEPENDENTS = ["SW-ITA-ESTOQ", "SW-ITA-EXPED", "AP-ITA-01", "AP-ITA-02", "AP-ITA-03", "CAM-ITA-01", "CAM-ITA-02", "CAM-ITA-03", "IMP-ITA-RH", "IMP-ITA-FISCAL", "RELOGIO-PONTO", "NVR-ITA"];

/** Monta o snapshot de exemplo; `now` permite testes determinísticos. */
export function buildMockSnapshot(now: Date = new Date()): TowerSnapshot {
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();

  const links: TowerLink[] = [
    link({ id: "bar-claro", name: "Claro 300M", site: "BAR", gatewayName: "MK-BARRA", mikrotikInterface: "ether1", description: "Claro empresarial · circuito #771204 · ☎ 0800-xxx-1010", drops7d: 0, availability24h: 99.94 }, 300, 279, 41, series(2, 48, 220, 70)),
    link({ id: "bar-vivo", name: "Vivo 200M", site: "BAR", gatewayName: "MK-BARRA", mikrotikInterface: "ether2", description: "Vivo standby · circuito #550931", availability24h: 99.81 }, 200, 62, 12, series(5, 48, 55, 25)),
    link({ id: "bot-algar", name: "Algar 500M", site: "BOT", gatewayName: "MK-BOTAFOGO", mikrotikInterface: "ether1", availability24h: 99.97 }, 500, 225, 60, series(9, 48, 210, 80)),
    link({ id: "bot-oi", name: "Oi 200M", site: "BOT", gatewayName: "MK-BOTAFOGO", mikrotikInterface: "ether2", availability24h: 99.42 }, 200, 24, 5, series(4, 48, 20, 10)),
    link(
      { id: "ita-vivo", name: "Vivo 500M", site: "ITA", isOnline: false, downForSec: 862, usagePct: null, latencyMs: null, gatewayName: "RB5009", mikrotikInterface: "ether1", drops7d: 2, availability24h: 98.72, lastDownAt: ago(14), description: "Vivo empresarial · circuito #123456 · ☎ 0800-xxx-5050" },
      500, 0, 0, series(7, 42, 260, 90).concat([0, 0, 0, 0, 0, 0]),
    ),
    link({ id: "ita-tim", name: "Tim 300M", site: "ITA", gatewayName: "RB5009", mikrotikInterface: "ether2", description: "Failover do Itaguaí" }, 300, 198, 33, series(3, 42, 30, 12).concat([150, 170, 185, 190, 196, 198])),
  ];
  // Claro BAR em 93%.
  links[0] = { ...links[0], downBps: 279 * M, usagePct: 93 };

  const dev = (id: string, name: string, ip: string, type: string, site: SiteKey | null, state: DeviceState, extra: Partial<TowerDevice> = {}): TowerDevice => ({
    id, name, ip, type, site, state,
    isOnline: state === "ok" ? true : state === "unk" ? null : false,
    responseMs: state === "ok" ? 2 : null,
    cpuPct: null,
    offlineForSec: state === "ok" || state === "unk" ? null : 600,
    consecutiveFailures: state === "ok" || state === "unk" ? 0 : 3,
    acknowledged: state === "ack", ackBy: null, ackNote: null, maintenanceUntil: null,
    suppressedByLinkId: state === "sup" ? "ita-vivo" : null,
    spark: series(id.length, 30, 3, 2),
    ...extra,
  });

  const devices: TowerDevice[] = [
    dev("rb5009", "RB5009", "192.168.0.1", "MIKROTIK", "ITA", "ok", { cpuPct: 22 }),
    dev("sw-ita-core", "SW-ITA-CORE", "192.168.0.2", "OTHER", "ITA", "ok"),
    dev("css326-a", "CSS326-ITA-A", "192.168.0.3", "OTHER", "ITA", "unk"),
    ...ITA_DEPENDENTS.map((n, i) => dev(`ita-dep-${i}`, n, `192.168.0.${20 + i}`, "OTHER", "ITA", "sup", { offlineForSec: 862 })),
    dev("mk-barra", "MK-BARRA", "172.16.1.1", "MIKROTIK", "BAR", "ok", { cpuPct: 9 }),
    dev("cloudkey", "UniFi CloudKey", "172.16.1.200", "OTHER", "BAR", "ok"),
    dev("nvr-bar", "NVR-BAR-01", "172.16.1.40", "DVR", "BAR", "ok"),
    dev("mk-bot", "MK-BOTAFOGO", "10.0.0.1", "MIKROTIK", "BOT", "ok", { cpuPct: 31 }),
    dev("oc200", "Omada OC200", "10.0.0.19", "OTHER", "BOT", "ok"),
    dev("nvr-02", "NVR-02", "10.0.0.42", "DVR", "BOT", "crit", { offlineForSec: 190, spark: series(4, 30, 3, 2).concat([0, 0, 0, 0]) }),
    dev("ap-recepcao", "AP-Recepção", "10.0.0.61", "OMADA_AP", "BOT", "ack", { offlineForSec: 6000, ackBy: "matheus", ackNote: "troca de cabo" }),
    dev("sem-unidade-1", "CAM-AVULSA-1", "10.9.9.1", "CAMERA", null, "unk"),
    dev("sem-unidade-2", "CAM-AVULSA-2", "10.9.9.2", "CAMERA", null, "unk"),
  ];

  const aps: TowerAp[] = [
    { id: "ap1", name: "EAP225-Sala2", site: "BOT", vendor: "omada", state: "crit", clients: null, channel: null, utilPct: null, signalDbm: null, offlineForSec: 2520 },
    { id: "ap2", name: "EAP225-Recep", site: "BOT", vendor: "omada", state: "ok", clients: 38, channel: "6/2G", utilPct: 84, signalDbm: -71, offlineForSec: null },
    { id: "ap3", name: "U6-Lite-Coz", site: "BAR", vendor: "unifi", state: "ok", clients: 22, channel: "36/5G", utilPct: 52, signalDbm: -63, offlineForSec: null },
  ];

  const sites = ([...(["BAR", "BOT", "ITA"] as const), null] as (SiteKey | null)[]).map((site) => {
    const ds = devices.filter((d) => d.site === site);
    const ls = links.filter((l) => l.site === site);
    const as = aps.filter((a) => a.site === site);
    return {
      site,
      name: site ? SITE_NAMES[site] : "sem unidade",
      devicesTotal: ds.length,
      devicesOnline: ds.filter((d) => d.state === "ok").length,
      devicesOffline: ds.filter((d) => d.state === "crit").length,
      devicesSuppressed: ds.filter((d) => d.state === "sup").length,
      apsTotal: as.length,
      apsOnline: as.filter((a) => a.state === "ok").length,
      linksTotal: ls.length,
      linksOnline: ls.filter((l) => l.isOnline).length,
      clients: as.length ? as.reduce((n, a) => n + (a.clients ?? 0), 0) : null,
      dots: ds.map((d) => d.state),
    };
  });

  return {
    health: { workerStatus: "ok", workerAgeSec: 12, generatedAt: now.toISOString(), uptimePct24h: 99.2 },
    problems: [
      { id: "LINK:ita-vivo", kind: "LINK", entityId: "ita-vivo", site: "ITA", name: "Vivo 500M", severity: "crit", what: "DOWN", why: "webhook · failover → Tim ok", sinceSec: 862, children: ITA_DEPENDENTS.map((n, i) => ({ id: `ita-dep-${i}`, name: n, kind: "DISP" as const })), acknowledged: false, ackBy: null, ackNote: null },
      { id: "DISP:nvr-02", kind: "DISP", entityId: "nvr-02", site: "BOT", name: "NVR-02", severity: "crit", what: "offline", why: "ping ×3 (limite de alerta)", sinceSec: 190, children: [], acknowledged: false, ackBy: null, ackNote: null },
      { id: "LINK:bar-claro", kind: "LINK", entityId: "bar-claro", site: "BAR", name: "Claro 300M", severity: "warn", what: "uso 93%", why: "acima de 90% há 6 min", sinceSec: 400, children: [], acknowledged: false, ackBy: null, ackNote: null },
      { id: "DISP:ap-recepcao", kind: "DISP", entityId: "ap-recepcao", site: "BOT", name: "AP-Recepção", severity: "ack", what: "offline", why: "troca de cabo", sinceSec: 6000, children: [], acknowledged: true, ackBy: "matheus", ackNote: "troca de cabo" },
    ],
    links,
    devices,
    aps,
    sites,
    events: [
      { id: "e1", at: ago(1), severity: "crit", site: "BOT", text: "BOT NVR-02 offline (3 falhas)" },
      { id: "e2", at: ago(14), severity: "info", site: "ITA", text: "ITA rota padrão → Tim (failover em 41s)" },
      { id: "e3", at: ago(15), severity: "crit", site: "ITA", text: "ITA Vivo DOWN (webhook)" },
      { id: "e4", at: ago(23), severity: "warn", site: "BOT", text: "BOT AP-Recepção offline" },
      { id: "e5", at: ago(90), severity: "ok", site: "BOT", text: "BOT CRS voltou após 4 min" },
      { id: "e6", at: ago(105), severity: "warn", site: "BAR", text: "BAR Claro acima de 90% por 5 min" },
    ],
    monitored: { total: devices.length + links.length + aps.length, online: devices.filter((d) => d.state === "ok").length + links.filter((l) => l.isOnline).length + aps.filter((a) => a.state === "ok").length },
  };
}
