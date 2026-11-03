// Ponto único de envio de avisos (Zoho Cliq). Aplica silêncio, ack, anti-ruído e auditoria.
import { db } from "./db";
import { decrypt } from "./crypto";
import { log } from "./logger";
import { buildAlertMessage, sendCliq, type NotifyEvent } from "./cliq";

export const WARN_MIN_DURATION_MS = 15 * 60_000;
const CONFIG_TTL_MS = 30_000;
const FLAP_COOLDOWN_MS = 30 * 60_000;

export interface NotifyResult {
  sent: boolean;
  reason?: string;
}

interface CliqConfig {
  enabled: boolean;
  webhookUrl: string | null;
  lastError: string | null;
}

let cache: { at: number; value: CliqConfig } | null = null;
const flapLast = new Map<string, number>();

export function resetNotifyCache(): void {
  cache = null;
  flapLast.clear();
}

async function loadConfig(): Promise<CliqConfig> {
  if (cache && Date.now() - cache.at < CONFIG_TTL_MS) return cache.value;
  const row = await db.systemConfig.findUnique({ where: { id: 1 } });
  let webhookUrl: string | null = null;
  if (row?.cliqWebhookUrlEnc) {
    try {
      webhookUrl = decrypt(row.cliqWebhookUrlEnc);
    } catch (err) {
      log("error", "[Cliq] não foi possível decifrar a URL do webhook", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const value = { enabled: !!row?.cliqEnabled, webhookUrl, lastError: row?.cliqLastError ?? null };
  cache = { at: Date.now(), value };
  return value;
}

type EntityState = {
  maintenanceUntil: Date | null;
  offlineAcknowledgedAt: Date | null;
  offlineAcknowledgedBy: string | null;
  offlineAcknowledgedNote: string | null;
  cliqNotifiedAt: Date | null;
  cliqRenotifiedAt: Date | null;
  site: string | null;
};

async function loadEntity(type: "device" | "link", id: string): Promise<EntityState | null> {
  const select = {
    maintenanceUntil: true, offlineAcknowledgedAt: true, offlineAcknowledgedBy: true,
    offlineAcknowledgedNote: true, cliqNotifiedAt: true, cliqRenotifiedAt: true, site: true,
  };
  return type === "link"
    ? ((await db.link.findUnique({ where: { id }, select })) as EntityState | null)
    : ((await db.device.findUnique({ where: { id }, select })) as EntityState | null);
}

function updateMany(type: "device" | "link", where: Record<string, unknown>, data: Record<string, unknown>) {
  return type === "link" ? db.link.updateMany({ where, data }) : db.device.updateMany({ where, data });
}

async function audit(event: NotifyEvent, ok: boolean, error?: string): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "CliqMessage",
        entityId: "id" in event ? event.id : null,
        entityName: "name" in event ? event.name : "WatchIT",
        username: "cliq",
        details: { event: event.kind, ok, ...(error ? { error } : {}) },
      },
    });
  } catch (err) {
    log("error", "[Cliq] falha ao registrar auditoria", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function affectedCount(site: string | null): Promise<number | undefined> {
  if (!site) return undefined;
  try {
    return await db.device.count({ where: { site, currentStatus: { is: { isOnline: false } } } });
  } catch {
    return undefined;
  }
}

async function siteHasLinkDown(site: string | null): Promise<boolean> {
  if (!site) return false;
  try {
    return (await db.link.count({ where: { site, isOnline: false } })) > 0;
  } catch {
    return false;
  }
}

export async function notify(event: NotifyEvent): Promise<NotifyResult> {
  try {
    return await doNotify(event);
  } catch (err) {
    log("error", "[Cliq] notify falhou", { error: err instanceof Error ? err.message : String(err) });
    return { sent: false, reason: "error" };
  }
}

async function doNotify(event: NotifyEvent): Promise<NotifyResult> {
  const appUrl = process.env.APP_URL;

  // Worker parado: sem entidade, sem silêncio/ack.
  if (event.kind === "WORKER_STALE") {
    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.webhookUrl) return { sent: false, reason: "disabled" };
    return deliver(event, cfg, buildAlertMessage(event, appUrl));
  }

  const type = event.entityType;
  const ent = await loadEntity(type, event.id);
  if (!ent) return { sent: false, reason: "not-found" };

  // Recuperação: só avisa se o episódio foi avisado; sempre limpa o estado do episódio.
  if (event.kind === "RECOVER") {
    const wasNotified = !!ent.cliqNotifiedAt;
    if (wasNotified || ent.cliqRenotifiedAt) {
      await updateMany(type, { id: event.id }, { cliqNotifiedAt: null, cliqRenotifiedAt: null });
    }
    if (!wasNotified) return { sent: false, reason: "not-notified" };
    if (ent.maintenanceUntil && ent.maintenanceUntil > new Date()) return { sent: false, reason: "maintenance" };
    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.webhookUrl) return { sent: false, reason: "disabled" };
    const full: NotifyEvent = {
      ...event,
      since: event.since ?? ent.cliqNotifiedAt,
      ackBy: event.ackBy ?? ent.offlineAcknowledgedBy,
      ackNote: event.ackNote ?? ent.offlineAcknowledgedNote,
    };
    return deliver(full, cfg, buildAlertMessage(full, appUrl));
  }

  const cfg = await loadConfig();
  if (!cfg.enabled || !cfg.webhookUrl) return { sent: false, reason: "disabled" };
  if (ent.maintenanceUntil && ent.maintenanceUntil > new Date()) return { sent: false, reason: "maintenance" };

  if (event.kind === "FLAPPING") {
    const last = flapLast.get(event.id) ?? 0;
    if (Date.now() - last < FLAP_COOLDOWN_MS) return { sent: false, reason: "flapping-cooldown" };
    flapLast.set(event.id, Date.now());
    return deliver(event, cfg, buildAlertMessage(event, appUrl));
  }

  if (event.kind === "RENOTIFY") {
    if (ent.offlineAcknowledgedAt) return { sent: false, reason: "acked" };
    if (!ent.cliqNotifiedAt || ent.cliqRenotifiedAt) return { sent: false, reason: "already-renotified" };
    const claim = await updateMany(type, { id: event.id, cliqRenotifiedAt: null }, { cliqRenotifiedAt: new Date() });
    if (claim.count !== 1) return { sent: false, reason: "already-renotified" };
    const affected = event.affected ?? (type === "link" ? await affectedCount(ent.site) : undefined);
    const full = { ...event, affected };
    const res = await deliver(full, cfg, buildAlertMessage(full, appUrl));
    if (!res.sent) await updateMany(type, { id: event.id }, { cliqRenotifiedAt: null });
    return res;
  }

  // OPEN
  if (event.severity === "WARN" && Date.now() - event.since.getTime() < WARN_MIN_DURATION_MS) {
    return { sent: false, reason: "warn-too-recent" };
  }
  if (type === "device" && (await siteHasLinkDown(ent.site))) return { sent: false, reason: "grouped" };
  if (ent.cliqNotifiedAt) return { sent: false, reason: "already-notified" };
  const claim = await updateMany(type, { id: event.id, cliqNotifiedAt: null }, { cliqNotifiedAt: new Date() });
  if (claim.count !== 1) return { sent: false, reason: "already-notified" };
  const affected = event.affected ?? (type === "link" ? await affectedCount(ent.site) : undefined);
  const full = { ...event, affected };
  const res = await deliver(full, cfg, buildAlertMessage(full, appUrl));
  if (!res.sent) await updateMany(type, { id: event.id }, { cliqNotifiedAt: null });
  return res;
}

async function deliver(
  event: NotifyEvent,
  cfg: CliqConfig,
  message: ReturnType<typeof buildAlertMessage>,
): Promise<NotifyResult> {
  try {
    await sendCliq(cfg.webhookUrl as string, message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "[Cliq] falha ao enviar aviso", { event: event.kind, error: msg });
    await audit(event, false, msg);
    try {
      await db.systemConfig.update({ where: { id: 1 }, data: { cliqLastError: msg } });
      cfg.lastError = msg;
    } catch { /* ignora */ }
    return { sent: false, reason: "send-failed" };
  }
  log("info", "[Cliq] aviso enviado", { event: event.kind });
  await audit(event, true);
  if (cfg.lastError) {
    try {
      await db.systemConfig.update({ where: { id: 1 }, data: { cliqLastError: null } });
      cfg.lastError = null;
    } catch { /* ignora */ }
  }
  return { sent: true };
}
