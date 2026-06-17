import { db } from "@/lib/db";

export interface WifiSignalData {
  signal: number | null;
  snr: number | null;
  ssid: string | null;
  band: string | null;
  apId: string;
  apName: string;
  apIp: string;
  matchedBy: "mac" | "ip";
  updatedAt: string;
}

type ClientEntry = {
  mac: string;
  ip?: string | null;
  signal?: number | null;
  snr?: number | null;
  ssid?: string | null;
  band?: string | null;
};

/**
 * Builds two lookup maps from every AP's latest client list:
 *   byMac: MAC (upper) → WifiSignalData
 *   byIp:  IP          → WifiSignalData
 *
 * Call once per request, then resolve each device with resolveSignal().
 */
export async function buildWifiSignalMap(): Promise<{
  byMac: Map<string, WifiSignalData>;
  byIp: Map<string, WifiSignalData>;
}> {
  const byMac = new Map<string, WifiSignalData>();
  const byIp  = new Map<string, WifiSignalData>();

  const aps = await db.device.findMany({
    where: { type: { in: ["UNIFI_AP", "OMADA_AP"] } },
    select: {
      id: true, name: true, ip: true, type: true,
      currentStatus: {
        select: { omadaData: true, unifiData: true, checkedAt: true },
      },
    },
  });

  for (const ap of aps) {
    const status = ap.currentStatus;
    if (!status) continue;
    const updatedAt = status.checkedAt
      ? new Date(status.checkedAt).toISOString()
      : new Date().toISOString();

    const rawClients: ClientEntry[] =
      ap.type === "OMADA_AP"
        ? ((status.omadaData as { clients?: ClientEntry[] })?.clients ?? [])
        : ((status.unifiData as { clients?: ClientEntry[] })?.clients ?? []);

    for (const c of rawClients) {
      const entry: WifiSignalData = {
        signal: c.signal ?? null,
        snr:    ap.type === "OMADA_AP" ? (c.snr ?? null) : null,
        ssid:   c.ssid ?? null,
        band:   c.band ?? null,
        apId:   ap.id,
        apName: ap.name,
        apIp:   ap.ip,
        matchedBy: "mac",
        updatedAt,
      };
      // First AP to report a client wins (avoid overwriting with staler data)
      const macKey = c.mac.toUpperCase();
      if (!byMac.has(macKey)) byMac.set(macKey, entry);
      if (c.ip && !byIp.has(c.ip)) byIp.set(c.ip, { ...entry, matchedBy: "ip" });
    }
  }

  return { byMac, byIp };
}

/** Resolve signal for a single device — MAC first, then IP. */
export function resolveSignal(
  maps: { byMac: Map<string, WifiSignalData>; byIp: Map<string, WifiSignalData> },
  macAddress: string | null,
  ip: string,
): WifiSignalData | null {
  if (macAddress) {
    const hit = maps.byMac.get(macAddress.toUpperCase());
    if (hit) return hit;
  }
  return maps.byIp.get(ip) ?? null;
}
