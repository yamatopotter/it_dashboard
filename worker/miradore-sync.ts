import { db } from "@/lib/db";
import { log } from "@/lib/logger";
import { resolveMiradoreApiKey } from "@/lib/crypto";
import { fetchMiradoreDevices } from "@/lib/miradore-client";

export async function syncMiradorePhones(): Promise<void> {
  try {
    const config = await db.systemConfig.findUnique({ where: { id: 1 } });

    if (!config?.moduleTelephony) {
      log("info", "Módulo Telefonia desligado: Miradore sync ignorado");
      return;
    }

    if (!config?.miradoreSyncEnabled) {
      log("info", "Miradore sync desabilitado");
      return;
    }

    if (!config.miradoreSiteName) {
      log("warn", "Miradore: site name não configurado");
      return;
    }

    const apiKey = resolveMiradoreApiKey(config);
    if (!apiKey) {
      log("warn", "Miradore: API key não configurada");
      return;
    }

    log("info", "Iniciando sincronização Miradore");

    const result = await fetchMiradoreDevices(config.miradoreSiteName, apiKey);

    if (result.error) {
      const errorMsg = `HTTP ${result.error.status}: ${result.error.message}`;
      log("error", "Miradore API error", { error: errorMsg });
      await db.systemConfig.update({
        where: { id: 1 },
        data: {
          miradoreLastSyncError: errorMsg,
          miradoreLastSyncAt: new Date(),
        },
      });
      return;
    }

    if (!result.devices) {
      log("warn", "Miradore: resposta vazia");
      return;
    }

    let upsertCount = 0;
    for (const device of result.devices) {
      if (!device.id) continue;

      await db.phone.updateMany({
        where: { miradoreDeviceId: device.id },
        data: {
          miradoreLastSeenAt: device.lastContact ? new Date(device.lastContact) : null,
          miradoreBatteryLevel: device.batteryLevel || null,
          miradoreOsVersion: device.osVersion || null,
          miradoreManufacturer: device.manufacturer || null,
          miradoreComplianceOk: device.complianceState === "compliant" ? true : null,
          miradoreSyncedAt: new Date(),
        },
      });

      // Se encontrou por miradoreDeviceId, incrementa contador
      const count = await db.phone.count({
        where: { miradoreDeviceId: device.id },
      });
      if (count > 0) {
        upsertCount++;
      }
    }

    await db.systemConfig.update({
      where: { id: 1 },
      data: {
        miradoreLastSyncAt: new Date(),
        miradoreLastSyncError: null,
      },
    });

    log("info", "Miradore sync completo", { phonesUpdated: upsertCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    log("error", "Miradore sync error", { error: message });
    await db.systemConfig
      .update({
        where: { id: 1 },
        data: { miradoreLastSyncError: message, miradoreLastSyncAt: new Date() },
      })
      .catch(() => {});
  }
}
