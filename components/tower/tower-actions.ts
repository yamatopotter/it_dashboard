// Ações da TOWER/1 sobre problemas: chamadas às rotas, cópia de resumo e abertura web.
import type { TowerAp, TowerDevice, TowerLink, TowerProblem, TowerSnapshot } from "@/lib/tower-types";
import { SEVERITY_LABEL, fmtAge } from "@/lib/tui-format";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Rota base da entidade: links têm rota própria; dispositivos e APs usam /api/devices. */
export function entityBase(p: Pick<TowerProblem, "kind" | "entityId">): string {
  return p.kind === "LINK" ? `/api/links/${encodeURIComponent(p.entityId)}` : `/api/devices/${encodeURIComponent(p.entityId)}`;
}

async function call(method: "POST" | "DELETE", url: string, body?: unknown): Promise<ActionResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return { ok: true, message: "" };
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* corpo vazio */
    }
    return { ok: false, message: msg };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "falha de rede" };
  }
}

export const ackProblem = (p: TowerProblem, note?: string) => call("POST", `${entityBase(p)}/ack`, note ? { note } : {});
export const unackProblem = (p: TowerProblem) => call("DELETE", `${entityBase(p)}/ack`);
export const silenceProblem = (p: TowerProblem, minutes: number) => call("POST", `${entityBase(p)}/silence`, { minutes });
export const unsilenceProblem = (p: TowerProblem) => call("DELETE", `${entityBase(p)}/silence`);

const CHECK_TYPES = ["MIKROTIK", "DVR", "CAMERA", "OTHER", "UNIFI_AP", "OMADA_AP"];

/** Tipo a rechecar para um problema: o do dispositivo, o do gateway (links) ou o do fornecedor (APs). */
export function recheckType(p: TowerProblem, snap: TowerSnapshot): string | null {
  if (p.kind === "DISP") {
    const t = snap.devices.find((d) => d.id === p.entityId)?.type;
    return t && CHECK_TYPES.includes(t) ? t : null;
  }
  if (p.kind === "LINK") return "MIKROTIK";
  const ap = snap.aps.find((a) => a.id === p.entityId);
  return ap ? (ap.vendor === "unifi" ? "UNIFI_AP" : "OMADA_AP") : null;
}

/** POST /api/devices/check (opcionalmente filtrado por tipo). */
export function recheck(type: string | null): Promise<ActionResult> {
  return call("POST", type ? `/api/devices/check?type=${encodeURIComponent(type)}` : "/api/devices/check");
}

/** Resumo de uma linha para colar no chamado. */
export function buildSummary(p: TowerProblem): string {
  const ack = p.acknowledged && p.ackBy ? ` · ack ${p.ackBy}${p.ackNote ? `: "${p.ackNote}"` : ""}` : "";
  return `[${SEVERITY_LABEL[p.severity]}] ${p.site ?? "?"} ${p.name} ${p.what} há ${fmtAge(p.sinceSec)} · ${p.why}${ack}`;
}

/** Copia texto; usa a API de clipboard e cai para execCommand. Retorna false se nada funcionou. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

type Entity = { kind: "LINK"; link: TowerLink } | { kind: "DISP"; device: TowerDevice } | { kind: "AP"; ap: TowerAp } | null;

/** Localiza a entidade de um problema no snapshot. */
export function findEntity(p: TowerProblem | undefined, snap: TowerSnapshot): Entity {
  if (!p) return null;
  if (p.kind === "LINK") {
    const link = snap.links.find((l) => l.id === p.entityId);
    return link ? { kind: "LINK", link } : null;
  }
  if (p.kind === "DISP") {
    const device = snap.devices.find((d) => d.id === p.entityId);
    return device ? { kind: "DISP", device } : null;
  }
  const ap = snap.aps.find((a) => a.id === p.entityId);
  return ap ? { kind: "AP", ap } : null;
}

/** IP para "abrir web": do dispositivo, ou do gateway Mikrotik de um link. */
export function webIp(p: TowerProblem, snap: TowerSnapshot): string | null {
  const e = findEntity(p, snap);
  if (!e) return null;
  if (e.kind === "DISP") return e.device.ip;
  if (e.kind === "LINK") return snap.devices.find((d) => d.name === e.link.gatewayName)?.ip ?? null;
  return null;
}

/** Fim do silêncio/manutenção do problema, se houver. */
export function maintenanceOf(p: TowerProblem | undefined, snap: TowerSnapshot): string | null {
  const e = findEntity(p, snap);
  if (!e) return null;
  if (e.kind === "LINK") return e.link.maintenanceUntil;
  if (e.kind === "DISP") return e.device.maintenanceUntil;
  return null;
}
