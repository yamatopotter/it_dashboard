// Derivações puras da interface NetTop sobre o TowerSnapshot (sem rede, sem React).
import type { DeviceState, TowerAp, TowerDevice, TowerLink, TowerSnapshot } from "@/lib/tower-types";
import { SITE_KEYS, SITE_NAMES, type SiteKey } from "@/lib/modules";
import { GLYPH } from "@/lib/tui-format";

export type WanRole = "active" | "standby" | "down";

/**
 * O snapshot não informa qual link carrega a rota padrão. Derivação: por unidade, entre os links online
 * o de maior tráfego (down+up) é o ATIVO; os demais online são STANDBY; offline é DOWN.
 * Empate (ex.: tudo sem tráfego medido) fica com o primeiro da lista.
 */
export function wanRoles(links: TowerLink[]): Map<string, WanRole> {
  const roles = new Map<string, WanRole>();
  const bySite = new Map<string, TowerLink[]>();
  for (const l of links) bySite.set(l.site ?? "?", [...(bySite.get(l.site ?? "?") ?? []), l]);
  const traffic = (l: TowerLink) => (l.downBps ?? 0) + (l.upBps ?? 0);
  for (const group of bySite.values()) {
    const online = group.filter((l) => l.isOnline);
    const active = online.reduce<TowerLink | null>((best, l) => (best == null || traffic(l) > traffic(best) ? l : best), null);
    for (const l of group) roles.set(l.id, !l.isOnline ? "down" : l === active ? "active" : "standby");
  }
  return roles;
}

/** Piora primeiro: offline, depois util > 80%, depois o resto. */
export function apRank(a: TowerAp): number {
  return a.state === "crit" ? 0 : (a.utilPct ?? 0) > 80 ? 1 : 2;
}
export function sortAps(aps: TowerAp[]): TowerAp[] {
  return aps.slice().sort((a, b) => apRank(a) - apRank(b) || (b.utilPct ?? -1) - (a.utilPct ?? -1) || a.name.localeCompare(b.name));
}

/** Comando RouterOS de diagnóstico para colar no terminal do gateway do link. */
export function routerosCommand(l: TowerLink): string {
  const iface = l.mikrotikInterface ?? "etherX";
  return [
    "/ip route print where dst-address=0.0.0.0/0",
    `/interface print stats where name=${iface}`,
    `/ping 1.1.1.1 count=3 interface=${iface}`,
  ].join("; ");
}

const GLYPH_CLS: Record<DeviceState, string> = { ok: "ok", crit: "crit", ack: "dim", maint: "dim", sup: "dim", unk: "dim" };

export interface TreeLine { text: string; cls: string }

/** Árvore de topologia em texto: gateway (MIKROTIK) → demais equipamentos de rede → APs, por unidade. Hierarquia derivada (o snapshot não guarda pai/filho físico). */
export function buildTopology(snap: TowerSnapshot): TreeLine[] {
  const out: TreeLine[] = [];
  const sites: (SiteKey | null)[] = [...SITE_KEYS, null];
  for (const site of sites) {
    const devs = snap.devices.filter((d) => d.site === site && !/_AP$|^CAMERA$|^DVR$|^NVR$/.test(d.type));
    const aps = snap.aps.filter((a) => a.site === site);
    if (!devs.length && !aps.length) continue;
    const gws = devs.filter((d) => d.type === "MIKROTIK");
    const rest = devs.filter((d) => d.type !== "MIKROTIK");
    out.push({ text: site ? SITE_NAMES[site].toUpperCase() : "SEM UNIDADE", cls: "dim" });
    const nodes: TreeLine[] = [];
    const devLine = (d: TowerDevice): TreeLine => ({
      text: `${GLYPH[d.state]} ${d.name} ${d.ip}${d.cpuPct != null ? ` · cpu ${d.cpuPct}%` : ""}`,
      cls: GLYPH_CLS[d.state],
    });
    gws.forEach((d) => nodes.push(devLine(d)));
    const sup = rest.filter((d) => d.state === "sup");
    rest.filter((d) => d.state !== "sup").forEach((d) => nodes.push(devLine(d)));
    if (sup.length) nodes.push({ text: `◌ ${sup.length} equipamentos suprimidos (sem resposta pelo link)`, cls: "dim" });
    sortAps(aps).slice(0, 8).forEach((a) =>
      nodes.push({
        text: `${GLYPH[a.state]} ${a.name} · ${a.vendor === "unifi" ? "UniFi" : "Omada"}${a.state === "crit" ? " · offline" : a.clients != null ? ` · ${a.clients} cli` : ""}${a.utilPct != null && a.utilPct > 80 ? ` · util ${a.utilPct}%` : ""}`,
        cls: a.state === "crit" ? "crit" : (a.utilPct ?? 0) > 80 ? "warn" : GLYPH_CLS[a.state],
      }),
    );
    if (aps.length > 8) nodes.push({ text: `… +${aps.length - 8} APs`, cls: "dim" });
    nodes.forEach((n, i) => out.push({ text: `${i === nodes.length - 1 ? "└─" : "├─"} ${n.text}`, cls: n.cls }));
  }
  return out;
}
