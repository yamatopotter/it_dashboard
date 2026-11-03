import { httpsGetApiKey } from "./unifi-http";
import type { UnifiResult, UnifiSSID, UnifiClient } from "./unifi";
import { SharedCache, snapshotTtlMs } from "../connections/ttl-cache";
import { recordConn, shortHash } from "../connections/stats";

// On UniFi OS (port 443) the app is proxied under /proxy/network/.
// On standalone Network Application (port 8443) the path is direct.
const CANDIDATE_BASES = [
  "/proxy/network/integration/v1",
  "/integration/v1",
];

interface Page<T>       { data?: T[] }
interface SiteItem      { id: string; name: string; internalReference?: string }
// state: the Integration API v1 reports this as a string enum ("ONLINE", "OFFLINE",
// "PENDING_ADOPTION", ...). Some controller versions omit it. We treat absent as connected.
interface DeviceItem    { id: string; macAddress: string; model?: string; firmwareVersion?: string; ipAddress?: string; state?: string | number }
interface StatsItem     { uptimeSec?: number; cpuUtilizationPct?: number; memoryUtilizationPct?: number; uplink?: { txRateBps?: number; rxRateBps?: number } }
interface ClientItem    { id: string; type?: string; name?: string; macAddress?: string; ipAddress?: string; connectedAt?: string; uplinkDeviceId?: string }
interface BroadcastItem { id: string; name: string; enabled?: boolean; broadcastingFrequenciesGHz?: number[] }

export async function discoverBase(
  host: string, port: number, apiKey: string, tlsVerify: boolean,
): Promise<string> {
  let lastError: Error | null = null;
  for (const base of CANDIDATE_BASES) {
    try {
      const { status } = await httpsGetApiKey(host, port, `${base}/sites`, apiKey, tlsVerify);
      if (status === 401 || status === 403) throw new Error("Chave de API inválida ou sem permissão (HTTP " + status + ")");
      if (status < 400) return base;
      lastError = new Error(`HTTP ${status} em ${base}/sites`);
    } catch (e) {
      const err = e as Error;
      if (/inválid|permissão|recusad|Timeout|Certificado/i.test(err.message)) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error("API UniFi não encontrada — verifique IP, porta e versão do controlador (≥ 9.3)");
}

function freqLabel(ghz: number): string {
  if (ghz === 2.4) return "2.4 GHz";
  if (ghz === 5) return "5 GHz";
  if (ghz === 6) return "6 GHz";
  return `${ghz} GHz`;
}

// The Integration API returns `state` as a string ("ONLINE"); older/legacy shapes use
// a number (1=connected). Absent → assume connected (controller didn't report state).
function isApConnected(state: string | number | undefined): boolean {
  if (state == null) return true;
  if (typeof state === "number") return state === 1;
  return state.toUpperCase() === "ONLINE";
}

interface ApiKeySnapshot {
  siteId: string;
  siteName: string;
  devices: DeviceItem[];
  clients: ClientItem[];
  broadcasts: BroadcastItem[];
}

// The API base path is discovered once per (controller, key) and reused; the
// per-site snapshot (devices + clients + broadcasts) is shared by all APs of the site.
const BASE_MAX_AGE_MS = 3_600_000;
const baseCache = new SharedCache<string>();
const snapshotCache = new SharedCache<ApiKeySnapshot>();

// Test helper: forget cached bases and snapshots
export function resetUnifiApiKeyCache(): void {
  baseCache.clear();
  snapshotCache.clear();
}

export async function checkUnifiApiKey(
  apIp: string, controllerIp: string, apiKey: string,
  port: number, site: string, tlsVerify: boolean,
  checkIntervalSec?: number,
): Promise<UnifiResult> {
  const baseKey = `${controllerIp}:${port}:${tlsVerify ? 1 : 0}:${shortHash(apiKey)}`;
  const snapKey = `${baseKey}:${site}`;

  let baseReused = true;
  const getBase = async (): Promise<string> => {
    const r = await baseCache.get(
      baseKey,
      () => discoverBase(controllerIp, port, apiKey, tlsVerify),
      (_v, age) => age < BASE_MAX_AGE_MS,
    );
    if (!r.hit) baseReused = false;
    return r.value;
  };

  const fetchSnapshot = async (): Promise<ApiKeySnapshot> => {
    const base = await getBase();
    const sitesRes = await httpsGetApiKey(controllerIp, port, `${base}/sites?limit=200`, apiKey, tlsVerify);
    const sites = (sitesRes.body as Page<SiteItem>).data ?? [];
    const siteObj = sites.find((s) => s.name === site || s.id === site || s.internalReference === site);
    if (!siteObj) {
      const available = sites.map((s) => `"${s.name}" (ref: ${s.internalReference ?? s.id})`).join(", ");
      throw new Error(`Site "${site}" não encontrado. Disponíveis: ${available || "(nenhum)"}`);
    }
    const [devRes, clientsRes, broadcasts] = await Promise.all([
      httpsGetApiKey(controllerIp, port, `${base}/sites/${siteObj.id}/devices?limit=200`, apiKey, tlsVerify),
      httpsGetApiKey(controllerIp, port, `${base}/sites/${siteObj.id}/clients?limit=200`, apiKey, tlsVerify),
      httpsGetApiKey(controllerIp, port, `${base}/sites/${siteObj.id}/wifi/broadcasts?limit=200`, apiKey, tlsVerify)
        .then((r) => (r.body as Page<BroadcastItem>).data ?? [])
        .catch(() => [] as BroadcastItem[]), // non-fatal
    ]);
    return {
      siteId: siteObj.id,
      siteName: siteObj.name,
      devices: (devRes.body as Page<DeviceItem>).data ?? [],
      clients: (clientsRes.body as Page<ClientItem>).data ?? [],
      broadcasts,
    };
  };

  let snap;
  try {
    const maxAge = snapshotTtlMs(checkIntervalSec);
    snap = await snapshotCache.get(snapKey, fetchSnapshot, (_v, age) => age < maxAge);
  } catch (err) {
    baseCache.invalidate(baseKey); // re-discover next time (key revoked, base moved…)
    recordConn("unifi", "error");
    throw err;
  }
  recordConn("unifi", snap.hit || baseReused ? "reused" : "opened");

  const { siteId, siteName, devices } = snap.value;
  const base = await getBase();
  const ap = devices.find((d) => d.ipAddress === apIp) ?? (devices.length === 1 ? devices[0] : undefined);
  if (!ap) {
    throw new Error(`AP com IP ${apIp} não encontrado no site "${siteName}" (${devices.length} dispositivo(s))`);
  }

  let cpuLoad: number | null = null;
  let memoryUsed: number | null = null;
  let uptime: number | null = null;
  let uplinkTxBps: number | null = null;
  let uplinkRxBps: number | null = null;
  try {
    const statsRes = await httpsGetApiKey(
      controllerIp, port,
      `${base}/sites/${siteId}/devices/${ap.id}/statistics/latest`,
      apiKey, tlsVerify,
    );
    const s = statsRes.body as StatsItem | null;
    if (s) {
      uptime      = s.uptimeSec          ?? null;
      cpuLoad     = s.cpuUtilizationPct  ?? null;
      memoryUsed  = s.memoryUtilizationPct ?? null;
      uplinkTxBps = s.uplink?.txRateBps  ?? null;
      uplinkRxBps = s.uplink?.rxRateBps  ?? null;
    }
  } catch { /* non-fatal */ }

  const apClients = snap.value.clients.filter((c) => c.type === "WIRELESS" && c.uplinkDeviceId === ap.id);

  const ssids: UnifiSSID[] = snap.value.broadcasts
    .filter((b) => b.enabled !== false)
    .map((b) => ({
      ssid: b.name,
      band: (b.broadcastingFrequenciesGHz ?? []).map(freqLabel).join(" / ") || "—",
      channel: 0, clients: 0, txBytes: 0, rxBytes: 0,
    }));

  const clients: UnifiClient[] = apClients.map((c) => ({
    id: c.id,
    name: c.name ?? c.macAddress ?? c.id,
    mac: c.macAddress ?? "",
    ip: c.ipAddress ?? null,
    connectedAt: c.connectedAt ?? null,
    signal: null,
    ssid: null,
  }));

  return { connected: isApConnected(ap.state), model: ap.model ?? null, firmware: ap.firmwareVersion ?? null, uptime, cpuLoad, memoryUsed, uplinkTxBps, uplinkRxBps, totalClients: apClients.length, ssids, clients };
}
