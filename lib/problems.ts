// Regras puras (sem db) que transformam links/dispositivos/APs já carregados na fila de problemas
// do TOWER. Usado por lib/tower-snapshot.ts.
//
// Simplificações assumidas:
// - Uso de link: não há histórico de uso por link no banco além do spark; usamos só o `usagePct`
//   atual (>= 90%) e NÃO verificamos "por >= 5 min". Quando houver amostragem de uso, filtrar antes.
// - Falhas consecutivas vêm prontas do chamador (contagem em StatusHistory desde o último online).

import type { SiteKey } from "@/lib/modules";
import type { DeviceState, EntityKind, Severity, TowerProblem } from "@/lib/tower-types";

export const USAGE_WARN_PCT = 90;

export interface ProblemLinkInput {
  id: string;
  name: string;
  site: SiteKey | null;
  isOnline: boolean;
  usagePct: number | null;
  /** Desde quando está DOWN (último evento DOWN). */
  downSince: Date | null;
  maintenanceUntil: Date | null;
  ackAt: Date | null;
  ackBy: string | null;
  ackNote: string | null;
}

export interface ProblemDeviceInput {
  id: string;
  name: string;
  /** DISP = rede (Mikrotik/switch/outro), AP = Wi-Fi. */
  kind: "DISP" | "AP";
  /** DeviceType do Prisma. */
  type: string;
  site: SiteKey | null;
  /** null = sem status ainda. */
  isOnline: boolean | null;
  consecutiveFailures: number;
  alertThreshold: number;
  /** Desde quando está offline (primeira falha da sequência). */
  offlineSince: Date | null;
  maintenanceUntil: Date | null;
  ackAt: Date | null;
  ackBy: string | null;
  ackNote: string | null;
}

export interface ProblemInput {
  links: ProblemLinkInput[];
  devices: ProblemDeviceInput[];
  now?: Date;
}

export interface DeviceAnalysis {
  state: DeviceState;
  suppressedByLinkId: string | null;
  /** Pai do agrupamento (id do link, ou "DISP:<id>" do gateway). */
  suppressedBy: string | null;
}

export interface ProblemAnalysis {
  problems: TowerProblem[];
  devices: Map<string, DeviceAnalysis>;
}

const SEV_RANK: Record<Severity, number> = { crit: 0, warn: 1, ack: 2, info: 3 };

function inFuture(d: Date | null, now: Date): boolean {
  return !!d && d.getTime() > now.getTime();
}

function secsSince(d: Date | null, now: Date): number {
  return d ? Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000)) : 0;
}

export function analyzeProblems(input: ProblemInput): ProblemAnalysis {
  const now = input.now ?? new Date();
  const problems: TowerProblem[] = [];
  const devStates = new Map<string, DeviceAnalysis>();

  // ── Links ──────────────────────────────────────────────────────────────────
  const parentsBySite = new Map<SiteKey, { problem: TowerProblem; linkId: string | null }>();

  for (const l of input.links) {
    if (inFuture(l.maintenanceUntil, now)) continue;
    if (!l.isOnline) {
      const ack = !!l.ackAt;
      const p: TowerProblem = {
        id: `LINK:${l.id}`,
        kind: "LINK",
        entityId: l.id,
        site: l.site,
        name: l.name,
        severity: ack ? "ack" : "crit",
        what: "DOWN",
        why: "webhook",
        sinceSec: secsSince(l.downSince, now),
        children: [],
        acknowledged: ack,
        ackBy: ack ? l.ackBy : null,
        ackNote: ack ? l.ackNote : null,
      };
      problems.push(p);
      if (l.site) {
        const cur = parentsBySite.get(l.site);
        if (!cur || p.sinceSec > cur.problem.sinceSec) parentsBySite.set(l.site, { problem: p, linkId: l.id });
      }
    } else if (l.usagePct != null && l.usagePct >= USAGE_WARN_PCT) {
      problems.push({
        id: `LINK:${l.id}`,
        kind: "LINK",
        entityId: l.id,
        site: l.site,
        name: l.name,
        severity: "warn",
        what: `uso ${Math.round(l.usagePct)}%`,
        why: "banda contratada saturada",
        sinceSec: 0,
        children: [],
        acknowledged: false,
        ackBy: null,
        ackNote: null,
      });
    }
  }

  // ── Dispositivos / APs ─────────────────────────────────────────────────────
  interface Candidate { d: ProblemDeviceInput; problem: TowerProblem }
  const candidates: Candidate[] = [];

  for (const d of input.devices) {
    if (inFuture(d.maintenanceUntil, now)) {
      devStates.set(d.id, { state: "maint", suppressedByLinkId: null, suppressedBy: null });
      continue;
    }
    const offline = d.isOnline === false;
    if (!offline) {
      devStates.set(d.id, { state: d.isOnline === null ? "unk" : "ok", suppressedByLinkId: null, suppressedBy: null });
      continue;
    }
    // Abaixo do limiar: ainda não é problema.
    if (d.consecutiveFailures < Math.max(1, d.alertThreshold)) {
      devStates.set(d.id, { state: "ok", suppressedByLinkId: null, suppressedBy: null });
      continue;
    }
    const ack = !!d.ackAt;
    const critical = d.type === "MIKROTIK";
    candidates.push({
      d,
      problem: {
        id: `${d.kind}:${d.id}`,
        kind: d.kind,
        entityId: d.id,
        site: d.site,
        name: d.name,
        severity: ack ? "ack" : critical ? "crit" : "warn",
        what: "offline",
        why: `ping ×${d.consecutiveFailures}`,
        sinceSec: secsSince(d.offlineSince, now),
        children: [],
        acknowledged: ack,
        ackBy: ack ? d.ackBy : null,
        ackNote: ack ? d.ackNote : null,
      },
    });
  }

  // Gateways (Mikrotik) offline por unidade também servem de pai quando não há link DOWN.
  const gatewayBySite = new Map<SiteKey, Candidate>();
  for (const c of candidates) {
    if (c.d.type !== "MIKROTIK" || !c.d.site) continue;
    const cur = gatewayBySite.get(c.d.site);
    if (!cur || c.problem.sinceSec > cur.problem.sinceSec) gatewayBySite.set(c.d.site, c);
  }

  for (const c of candidates) {
    const site = c.d.site;
    let parent: { problem: TowerProblem; linkId: string | null } | null = null;
    if (site) {
      parent = parentsBySite.get(site) ?? null;
      if (!parent) {
        const gw = gatewayBySite.get(site);
        if (gw && gw !== c) parent = { problem: gw.problem, linkId: null };
      }
    }
    if (parent) {
      parent.problem.children.push({ id: c.d.id, name: c.d.name, kind: c.d.kind });
      devStates.set(c.d.id, { state: "sup", suppressedByLinkId: parent.linkId, suppressedBy: parent.problem.id });
    } else {
      problems.push(c.problem);
      devStates.set(c.d.id, {
        state: c.problem.acknowledged ? "ack" : "crit",
        suppressedByLinkId: null,
        suppressedBy: null,
      });
    }
  }

  problems.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.sinceSec - a.sinceSec);
  return { problems, devices: devStates };
}

export function computeProblems(input: ProblemInput): TowerProblem[] {
  return analyzeProblems(input).problems;
}

export type { EntityKind };
