import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { resolveDattoCredentials } from "@/lib/crypto";
import { getDattoToken, fetchAllDevices, fetchOpenAlerts, type DattoAlert } from "./datto-client";

const PRIORITY_RANK: Record<string, number> = {
  Critical: 5,
  High: 4,
  Moderate: 3,
  Low: 2,
  Information: 1,
};

function highestPriority(alerts: DattoAlert[]): string | null {
  let best: string | null = null;
  let bestRank = 0;
  for (const alert of alerts) {
    const rank = PRIORITY_RANK[alert.priority ?? ""] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = alert.priority ?? null;
    }
  }
  return best;
}

export async function syncDattoDevices(): Promise<void> {
  try {
    const config = await db.systemConfig.findUnique({ where: { id: 1 } });

    if (!config?.moduleComputers) {
      log("info", "Módulo Computadores desligado: Datto RMM sync ignorado");
      return;
    }

    if (!config?.dattoSyncEnabled) {
      log("info", "Datto RMM sync desabilitado");
      return;
    }

    if (!config.dattoPlatform) {
      log("warn", "Datto RMM: plataforma/região não configurada");
      return;
    }

    const credentials = resolveDattoCredentials(config);
    if (!credentials) {
      log("warn", "Datto RMM: credenciais não configuradas");
      return;
    }

    log("info", "Iniciando sincronização Datto RMM");

    const tokenResult = await getDattoToken(config.dattoPlatform, credentials.apiKey, credentials.secretKey);
    if (tokenResult.error) {
      const errorMsg = `Autenticação: HTTP ${tokenResult.error.status}: ${tokenResult.error.message}`;
      log("error", "Datto RMM auth error", { error: errorMsg });
      await db.systemConfig.update({
        where: { id: 1 },
        data: { dattoLastSyncError: errorMsg, dattoLastSyncAt: new Date() },
      });
      return;
    }

    const accessToken = tokenResult.data.accessToken;

    const [devicesResult, alertsResult] = await Promise.all([
      fetchAllDevices(config.dattoPlatform, accessToken),
      fetchOpenAlerts(config.dattoPlatform, accessToken),
    ]);

    if (devicesResult.error) {
      const errorMsg = `Devices: HTTP ${devicesResult.error.status}: ${devicesResult.error.message}`;
      log("error", "Datto RMM devices API error", { error: errorMsg });
      await db.systemConfig.update({
        where: { id: 1 },
        data: { dattoLastSyncError: errorMsg, dattoLastSyncAt: new Date() },
      });
      return;
    }

    if (alertsResult.error) {
      const errorMsg = `Alerts: HTTP ${alertsResult.error.status}: ${alertsResult.error.message}`;
      log("error", "Datto RMM alerts API error", { error: errorMsg });
      await db.systemConfig.update({
        where: { id: 1 },
        data: { dattoLastSyncError: errorMsg, dattoLastSyncAt: new Date() },
      });
      return;
    }

    const alertsByDevice = new Map<string, DattoAlert[]>();
    for (const alert of alertsResult.data ?? []) {
      const deviceUid = alert.alertSourceInfo?.deviceUid;
      if (!deviceUid) continue;
      const list = alertsByDevice.get(deviceUid) ?? [];
      list.push(alert);
      alertsByDevice.set(deviceUid, list);
    }

    const now = new Date();
    let syncedCount = 0;

    for (const device of devicesResult.data ?? []) {
      if (!device.uid || !device.hostname) continue;

      const deviceAlerts = alertsByDevice.get(device.uid) ?? [];
      const deviceType =
        typeof device.deviceType === "string" ? device.deviceType : device.deviceType?.category ?? null;

      await db.computer.upsert({
        where: { dattoDeviceUid: device.uid },
        create: {
          dattoDeviceUid: device.uid,
          hostname: device.hostname,
          siteName: device.siteName ?? null,
          deviceType,
          operatingSystem: device.operatingSystem ?? null,
          intIpAddress: device.intIpAddress ?? null,
          extIpAddress: device.extIpAddress ?? null,
          lastLoggedInUser: device.lastLoggedInUser ?? null,
          online: device.online ?? false,
          lastSeenAt: device.lastSeen ? new Date(device.lastSeen) : null,
          lastRebootAt: device.lastReboot ? new Date(device.lastReboot) : null,
          lastAuditAt: device.lastAuditDate ? new Date(device.lastAuditDate) : null,
          deletedInDatto: device.deleted ?? false,
          openAlerts: deviceAlerts as any,
          openAlertsCount: deviceAlerts.length,
          highestAlertPriority: highestPriority(deviceAlerts),
          syncedAt: now,
        },
        update: {
          hostname: device.hostname,
          siteName: device.siteName ?? null,
          deviceType,
          operatingSystem: device.operatingSystem ?? null,
          intIpAddress: device.intIpAddress ?? null,
          extIpAddress: device.extIpAddress ?? null,
          lastLoggedInUser: device.lastLoggedInUser ?? null,
          online: device.online ?? false,
          lastSeenAt: device.lastSeen ? new Date(device.lastSeen) : null,
          lastRebootAt: device.lastReboot ? new Date(device.lastReboot) : null,
          lastAuditAt: device.lastAuditDate ? new Date(device.lastAuditDate) : null,
          deletedInDatto: device.deleted ?? false,
          openAlerts: deviceAlerts as any,
          openAlertsCount: deviceAlerts.length,
          highestAlertPriority: highestPriority(deviceAlerts),
          syncedAt: now,
        },
      });
      syncedCount++;
    }

    await db.systemConfig.update({
      where: { id: 1 },
      data: { dattoLastSyncAt: new Date(), dattoLastSyncError: null },
    });

    log("info", "Datto RMM sync completo", { computersSynced: syncedCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    log("error", "Datto RMM sync error", { error: message });
    await db.systemConfig
      .update({
        where: { id: 1 },
        data: { dattoLastSyncError: message, dattoLastSyncAt: new Date() },
      })
      .catch(() => {});
  }
}
