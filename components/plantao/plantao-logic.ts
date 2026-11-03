// Lógica pura do Plantão: busca universal, camadas de causa provável e resumo por unidade.
import { SITE_NAMES, type SiteKey } from "@/lib/modules";
import type { TowerProblem, TowerSnapshot } from "@/lib/tower-types";
import { SEVERITY_ORDER } from "@/lib/tui-format";

export type Tier = "link" | "gateway" | "sw/AP" | "ponta";
export const TIERS: Tier[] = ["link", "gateway", "sw/AP", "ponta"];

const SWITCH_RE = /^(sw|css|crs|switch)/i;

/** Camada de causa provável de um problema: link › gateway › sw/AP › ponta. */
export function tierOf(p: TowerProblem, snap: TowerSnapshot): Tier {
  if (p.kind === "LINK") return "link";
  if (p.kind === "AP") return "sw/AP";
  const d = snap.devices.find((x) => x.id === p.entityId);
  if (d?.type === "MIKROTIK") return "gateway";
  if (d && (d.type.endsWith("_AP") || SWITCH_RE.test(d.name))) return "sw/AP";
  return "ponta";
}

/** Fila agrupada por camada; dentro dela, gravidade e idade. */
export function orderProblems(problems: TowerProblem[], snap: TowerSnapshot, site: SiteKey | "ALL"): { tier: Tier; items: TowerProblem[] }[] {
  const list = problems.filter((p) => site === "ALL" || p.site === site);
  return TIERS.map((tier) => ({
    tier,
    items: list
      .filter((p) => tierOf(p, snap) === tier)
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.sinceSec - a.sinceSec),
  })).filter((g) => g.items.length > 0);
}

export type UnitStatus = { level: "ok" | "warn" | "crit"; text: string; count: number };

/** Status do cabeçalho da unidade: ● OK / ▲ n / ✖ n (ack não conta). */
export function unitStatus(problems: TowerProblem[], site: SiteKey | null): UnitStatus {
  const open = problems.filter((p) => p.site === site && p.severity !== "ack" && !p.acknowledged);
  if (open.some((p) => p.severity === "crit")) return { level: "crit", text: `✖ ${open.length}`, count: open.length };
  if (open.length) return { level: "warn", text: `▲ ${open.length}`, count: open.length };
  return { level: "ok", text: "● OK", count: 0 };
}

export interface SearchResult {
  key: string;
  kind: "LINK" | "DISP" | "AP";
  entityId: string;
  name: string;
  site: SiteKey | null;
  detail: string;
  level: "ok" | "crit" | "dim";
  stateText: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const siteText = (s: SiteKey | null) => (s ? `${s} ${SITE_NAMES[s]}` : "");

/** Busca por nome, IP ou unidade em links, dispositivos e APs do snapshot. */
export function searchSnapshot(snap: TowerSnapshot, query: string, limit = 6): SearchResult[] {
  const q = norm(query.trim());
  if (!q) return [];
  const out: SearchResult[] = [];
  for (const l of snap.links) {
    if (norm(`link ${l.name} ${siteText(l.site)}`).includes(q))
      out.push({
        key: `LINK:${l.id}`, kind: "LINK", entityId: l.id, name: l.name, site: l.site, level: l.isOnline ? "ok" : "crit",
        stateText: l.isOnline ? `● ${l.usagePct ?? "—"}% do contratado` : "✖ DOWN", detail: l.gatewayName ?? "",
      });
  }
  for (const d of snap.devices) {
    if (norm(`${d.name} ${d.ip} ${d.type} ${siteText(d.site)}`).includes(q))
      out.push({
        key: `DISP:${d.id}`, kind: "DISP", entityId: d.id, name: d.name, site: d.site,
        level: d.state === "ok" ? "ok" : d.state === "crit" ? "crit" : "dim",
        stateText: d.state === "ok" ? "● online" : d.state === "crit" ? "✖ offline" : d.state === "sup" ? "◌ suprimido" : d.state === "unk" ? "◌ sem dado" : "░ " + d.state,
        detail: `${d.ip} · ${d.type}`,
      });
  }
  for (const a of snap.aps) {
    if (norm(`${a.name} ap ${a.vendor} ${siteText(a.site)}`).includes(q))
      out.push({
        key: `AP:${a.id}`, kind: "AP", entityId: a.id, name: a.name, site: a.site, level: a.state === "ok" ? "ok" : a.state === "crit" ? "crit" : "dim",
        stateText: a.state === "ok" ? `● ${a.clients ?? 0} clientes` : "✖ offline", detail: a.vendor,
      });
  }
  return out.slice(0, limit);
}

/** Buckets de disponibilidade 24h (48 pontos) a partir do histórico: valor 0 = fora. */
export function availBuckets(spark: number[]): ("ok" | "c")[] {
  if (spark.length < 2) return [];
  return spark.map((v) => (v <= 0 ? "c" : "ok"));
}
