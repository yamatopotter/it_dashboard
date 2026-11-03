// Contrato do snapshot único que alimenta as quatro interfaces (TOWER/1, Plantão, NetTop, wtop).
// Produzido por lib/tower-snapshot.ts, servido em GET /api/tower, consumido por components/tui/*.
// Só dados do núcleo (links, rede, Wi-Fi). Módulos pausados não entram aqui.

import type { SiteKey } from "@/lib/modules";

export type Severity = "crit" | "warn" | "ack" | "info";
export type EntityKind = "LINK" | "DISP" | "AP";

/** Estado exibido de um equipamento. "sup" = parou de responder por causa de um link/gateway caído. */
export type DeviceState = "ok" | "crit" | "ack" | "maint" | "sup" | "unk";

export interface TowerLink {
  id: string;
  name: string;
  site: SiteKey | null;
  isOnline: boolean;
  /** Tempo em segundos desde que caiu (null se online). */
  downForSec: number | null;
  contractedDownBps: number | null;
  contractedUpBps: number | null;
  downBps: number | null;
  upBps: number | null;
  latencyMs: number | null;
  /** 0-100 do contratado (null se não há contratado ou o link está fora). */
  usagePct: number | null;
  /** Histórico de download (bps) das últimas ~24h em até 48 pontos, mais antigo primeiro. */
  spark: number[];
  /** Gateway Mikrotik e interface usados na medição. */
  gatewayName: string | null;
  mikrotikInterface: string | null;
  acknowledged: boolean;
  ackBy: string | null;
  ackNote: string | null;
  maintenanceUntil: string | null;
  /** Quedas nos últimos 7 dias. */
  drops7d: number;
  /** Disponibilidade % nas últimas 24h (null sem dados). */
  availability24h: number | null;
  lastDownAt: string | null;
  description: string | null;
}

export interface TowerDevice {
  id: string;
  name: string;
  ip: string;
  type: string;
  site: SiteKey | null;
  state: DeviceState;
  isOnline: boolean | null;
  responseMs: number | null;
  cpuPct: number | null;
  offlineForSec: number | null;
  consecutiveFailures: number;
  acknowledged: boolean;
  ackBy: string | null;
  ackNote: string | null;
  maintenanceUntil: string | null;
  /** Pai provável quando state === "sup": id do link que está caído na mesma unidade. */
  suppressedByLinkId: string | null;
  spark: number[];
}

export interface TowerAp {
  id: string;
  name: string;
  site: SiteKey | null;
  vendor: "unifi" | "omada";
  state: DeviceState;
  clients: number | null;
  channel: string | null;
  utilPct: number | null;
  signalDbm: number | null;
  offlineForSec: number | null;
}

export interface TowerProblem {
  /** `${kind}:${entityId}` — estável entre snapshots. */
  id: string;
  kind: EntityKind;
  entityId: string;
  site: SiteKey | null;
  name: string;
  severity: Severity;
  /** Texto curto do que está errado ("DOWN", "offline", "uso 93%"). */
  what: string;
  /** Motivo/origem ("webhook · failover → Tim ok", "ping ×3"). */
  why: string;
  sinceSec: number;
  /** Equipamentos suprimidos atrás deste problema (link/gateway caído). */
  children: { id: string; name: string; kind: EntityKind }[];
  acknowledged: boolean;
  ackBy: string | null;
  ackNote: string | null;
}

export interface TowerSiteSummary {
  site: SiteKey | null; // null = grupo "?" (sem unidade)
  name: string;
  devicesTotal: number;
  devicesOnline: number;
  devicesOffline: number;
  devicesSuppressed: number;
  apsTotal: number;
  apsOnline: number;
  linksTotal: number;
  linksOnline: number;
  clients: number | null;
  /** Um ponto por dispositivo, na ordem do painel. */
  dots: DeviceState[];
}

export interface TowerEvent {
  id: string;
  at: string;
  severity: "crit" | "warn" | "ok" | "info";
  site: SiteKey | null;
  text: string;
}

export interface TowerHealth {
  workerStatus: "ok" | "stale" | "unknown";
  workerAgeSec: number | null;
  /** Segundos desde que o snapshot foi gerado no servidor. O cliente soma o tempo local. */
  generatedAt: string;
  uptimePct24h: number | null;
}

export interface TowerSnapshot {
  health: TowerHealth;
  problems: TowerProblem[];
  links: TowerLink[];
  devices: TowerDevice[];
  aps: TowerAp[];
  sites: TowerSiteSummary[];
  events: TowerEvent[];
  /** Total de itens monitorados (para "✔ tudo ok · 140/142"). */
  monitored: { total: number; online: number };
}

/** Ações disponíveis sobre um problema; OPERADOR/ADMIN apenas. */
export type TowerAction = "ack" | "unack" | "silence" | "recheck";

export const SILENCE_OPTIONS_MIN = [60, 240, 720] as const;
