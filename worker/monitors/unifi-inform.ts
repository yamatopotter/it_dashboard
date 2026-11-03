import { httpsPostJson, httpsGetCookie } from "./unifi-http";
import type { UnifiResult, UnifiSSID, UnifiClient } from "./unifi";
import { SharedCache, snapshotTtlMs } from "../connections/ttl-cache";
import { recordConn, shortHash } from "../connections/stats";

const INFORM_LOGIN_CANDIDATES: Array<{ loginPath: string; base: string }> = [
  { loginPath: "/api/auth/login",          base: "/proxy/network" },
  { loginPath: "/proxy/network/api/login", base: "/proxy/network" },
  { loginPath: "/api/login",               base: "" },
];

interface InformVap {
  essid?: string;
  radio?: string;
  channel?: number;
  num_sta?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  up?: boolean;
}

interface InformDevice {
  mac: string;
  ip?: string;
  model?: string;
  version?: string;
  uptime?: number;
  // state: 1=connected; absent on some firmware versions → default to connected
  state?: number;
  "sys_stats"?: { cpu?: number; mem_used?: number; mem_total?: number };
  "system-stats"?: { cpu?: string; mem?: string };
  vap_table?: InformVap[];
  tx_bytes?: number;
  rx_bytes?: number;
  stat?: { ap?: { tx_bytes?: number; rx_bytes?: number } };
  uplink?: { rx_bytes?: number; tx_bytes?: number };
}

interface InformClient {
  mac: string;
  hostname?: string;
  ip?: string;
  signal?: number;
  essid?: string;
  ap_mac?: string;
  last_seen?: number;
}

function deviceBytes(d: InformDevice): { tx: number; rx: number } | null {
  const tx = d.tx_bytes ?? d.stat?.ap?.tx_bytes ?? d.uplink?.tx_bytes;
  const rx = d.rx_bytes ?? d.stat?.ap?.rx_bytes ?? d.uplink?.rx_bytes;
  if (tx == null || rx == null) return null;
  return { tx, rx };
}

function radioToBand(radio: string): string {
  if (radio === "ng") return "2.4 GHz";
  if (radio === "na") return "5 GHz";
  if (radio === "6e") return "6 GHz";
  return radio;
}

function extractCsrf(body: unknown): string | undefined {
  const b = body as Record<string, unknown> | null;
  if (!b) return undefined;
  if (typeof b.csrf === "string" && b.csrf) return b.csrf;
  if (typeof b.csrfToken === "string" && b.csrfToken) return b.csrfToken;
  return undefined;
}

interface Session { cookie: string; base: string; csrf?: string }
interface InformSnapshot { devices: InformDevice[]; clients: InformClient[] }
interface UplinkSample { tx: number; rx: number; at: number; txBps: number | null; rxBps: number | null }

// One login per (controller, user, credential) — cookie + csrf + base path are
// discovered once and reused until the controller answers 401/403.
const SESSION_MAX_AGE_MS = 6 * 3_600_000;
const sessionCache = new SharedCache<Session>();
const snapshotCache = new SharedCache<InformSnapshot>();
const uplinkSamples = new Map<string, UplinkSample>();

// Test helper: forget sessions, snapshots and uplink samples
export function resetUnifiInformCache(): void {
  sessionCache.clear();
  snapshotCache.clear();
  uplinkSamples.clear();
}

async function login(
  controllerIp: string, port: number, username: string, password: string, tlsVerify: boolean,
): Promise<Session> {
  // Try candidate paths (UniFi OS vs. standalone Network Application)
  for (const { loginPath, base } of INFORM_LOGIN_CANDIDATES) {
    const loginRes = await httpsPostJson(controllerIp, port, loginPath, { username, password }, tlsVerify);
    if (loginRes.status === 404) continue;
    if (loginRes.status !== 200) throw new Error(`Credenciais inválidas (HTTP ${loginRes.status})`);
    const cookie = (loginRes.cookies as string[]).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error("Login retornou HTTP 200 mas sem cookie de sessão");
    return { cookie, base, csrf: extractCsrf(loginRes.body) };
  }
  throw new Error("Endpoint de login não encontrado — verifique IP e porta do controlador");
}

export async function checkUnifiInform(
  apIp: string, controllerIp: string,
  username: string, password: string,
  port: number, site: string, tlsVerify: boolean,
  checkIntervalSec?: number,
): Promise<UnifiResult> {
  const sessKey = `${controllerIp}:${port}:${tlsVerify ? 1 : 0}:${username}:${shortHash(password)}`;
  const snapKey = `${sessKey}:${site}`;

  let sessionReused = true;
  const getSession = async (): Promise<Session> => {
    const r = await sessionCache.get(
      sessKey,
      () => login(controllerIp, port, username, password, tlsVerify),
      (_v, age) => age < SESSION_MAX_AGE_MS,
    );
    if (!r.hit) sessionReused = false;
    return r.value;
  };

  // GET with the cached session; on 401/403 drop the session, log in again and retry once
  const authedGet = async (path: string): Promise<{ status: number; body: unknown }> => {
    for (let attempt = 0; ; attempt++) {
      const sess = await getSession();
      const res = await httpsGetCookie(controllerIp, port, `${sess.base}${path}`, sess.cookie, tlsVerify, sess.csrf);
      if (attempt === 0 && (res.status === 401 || res.status === 403)) {
        sessionCache.invalidate(sessKey);
        sessionReused = false;
        continue;
      }
      return res;
    }
  };

  // 2+3. Device list and clients: one pair of requests per site per TTL window,
  //      shared by every AP of that site polled in the same cycle.
  const fetchSnapshot = async (): Promise<InformSnapshot> => {
    const [devRes, clientsRes] = await Promise.all([
      authedGet(`/api/s/${site}/stat/device`),
      authedGet(`/api/s/${site}/stat/sta`),
    ]);
    if (devRes.status === 404) throw new Error(`Site "${site}" não encontrado (HTTP 404)`);
    return {
      devices: ((devRes.body as { data?: InformDevice[] })?.data ?? []),
      clients: ((clientsRes.body as { data?: InformClient[] })?.data ?? []),
    };
  };

  let snap;
  try {
    const maxAge = snapshotTtlMs(checkIntervalSec);
    snap = await snapshotCache.get(snapKey, fetchSnapshot, (_v, age) => age < maxAge);
  } catch (err) {
    recordConn("unifi", "error");
    throw err;
  }
  recordConn("unifi", snap.hit || sessionReused ? "reused" : "opened");

  const devices = snap.value.devices;
  const ap = devices.find((d) => d.ip === apIp) ?? (devices.length === 1 ? devices[0] : undefined);
  if (!ap) throw new Error(`AP ${apIp} não encontrado no site "${site}" (${devices.length} dispositivo(s))`);

  const cpuRaw = ap["sys_stats"]?.cpu ?? (ap["system-stats"]?.cpu != null ? parseFloat(ap["system-stats"]!.cpu!) : undefined);
  const cpuLoad: number | null = cpuRaw != null && !isNaN(cpuRaw) ? cpuRaw : null;

  let memoryUsed: number | null = null;
  const ss = ap["sys_stats"];
  if (ss?.mem_used != null && ss?.mem_total != null && ss.mem_total > 0) {
    memoryUsed = (ss.mem_used / ss.mem_total) * 100;
  } else if (ap["system-stats"]?.mem != null) {
    const parsed = parseFloat(ap["system-stats"]!.mem!);
    if (!isNaN(parsed)) memoryUsed = parsed;
  }

  // 3. Clients (from the shared snapshot)
  const allClients = snap.value.clients;
  const apClients = allClients.filter((c) => c.ap_mac === ap.mac);

  // 4. SSIDs from vap_table
  const ssids: UnifiSSID[] = (ap.vap_table ?? [])
    .filter((v) => v.up !== false && v.essid)
    .map((v) => ({
      ssid: v.essid!,
      band: v.radio ? radioToBand(v.radio) : "—",
      channel: v.channel ?? 0,
      clients: v.num_sta ?? 0,
      txBytes: v.tx_bytes ?? 0,
      rxBytes: v.rx_bytes ?? 0,
    }));

  const clients: UnifiClient[] = apClients.map((c) => ({
    id: c.mac,
    name: c.hostname ?? c.mac,
    mac: c.mac,
    ip: c.ip ?? null,
    connectedAt: c.last_seen != null ? new Date(c.last_seen * 1000).toISOString() : null,
    signal: c.signal ?? null,
    ssid: c.essid ?? null,
  }));

  // 5. Uplink rate: Δbytes between the previous tick's sample and this snapshot (real
  //    elapsed time). Only the first sample / a reset counter / a stale sample falls
  //    back to a second device read 1 second later.
  let uplinkTxBps: number | null = null;
  let uplinkRxBps: number | null = null;
  const snap1 = deviceBytes(ap);
  if (snap1) {
    const sampleKey = `${snapKey}:${ap.mac}`;
    const prev = uplinkSamples.get(sampleKey);
    const elapsed = prev ? snap.at - prev.at : 0;
    if (prev && elapsed === 0) {
      // Same snapshot already consumed for this AP: reuse the rate computed from it
      uplinkTxBps = prev.txBps;
      uplinkRxBps = prev.rxBps;
    } else if (prev && elapsed >= 1_000 && elapsed <= 5 * 60_000 && snap1.tx >= prev.tx && snap1.rx >= prev.rx) {
      uplinkTxBps = Math.round(((snap1.tx - prev.tx) * 8 * 1000) / elapsed);
      uplinkRxBps = Math.round(((snap1.rx - prev.rx) * 8 * 1000) / elapsed);
      uplinkSamples.set(sampleKey, { ...snap1, at: snap.at, txBps: uplinkTxBps, rxBps: uplinkRxBps });
    } else {
      await new Promise((r) => setTimeout(r, 1_000));
      try {
        const devRes2 = await authedGet(`/api/s/${site}/stat/device`);
        const at2 = Date.now();
        const devices2 = ((devRes2.body as { data?: InformDevice[] })?.data ?? []);
        const ap2 = devices2.find((d) => d.ip === apIp) ?? (devices2.length === 1 ? devices2[0] : undefined);
        const snap2 = ap2 ? deviceBytes(ap2) : null;
        if (snap2) {
          const dt = Math.max(1_000, at2 - snap.at);
          uplinkTxBps = Math.round((Math.max(0, snap2.tx - snap1.tx) * 8 * 1000) / dt);
          uplinkRxBps = Math.round((Math.max(0, snap2.rx - snap1.rx) * 8 * 1000) / dt);
          uplinkSamples.set(sampleKey, { ...snap2, at: at2, txBps: uplinkTxBps, rxBps: uplinkRxBps });
        } else {
          uplinkSamples.set(sampleKey, { ...snap1, at: snap.at, txBps: null, rxBps: null });
        }
      } catch { /* non-fatal */ }
    }
  }

  return {
    connected: ap.state == null || ap.state === 1,
    model: ap.model ?? null,
    firmware: ap.version ?? null,
    uptime: ap.uptime ?? null,
    cpuLoad,
    memoryUsed,
    uplinkTxBps,
    uplinkRxBps,
    totalClients: apClients.length,
    ssids,
    clients,
  };
}
