import { httpsPostJson, httpsGetCookie } from "./unifi-http";
import type { UnifiResult, UnifiSSID, UnifiClient } from "./unifi";

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

export async function checkUnifiInform(
  apIp: string, controllerIp: string,
  username: string, password: string,
  port: number, site: string, tlsVerify: boolean,
): Promise<UnifiResult> {
  // 1. Login — try candidate paths
  let cookie = "";
  let base = "";
  let csrf: string | undefined;
  for (const { loginPath, base: candidateBase } of INFORM_LOGIN_CANDIDATES) {
    const loginRes = await httpsPostJson(controllerIp, port, loginPath, { username, password }, tlsVerify);
    if (loginRes.status === 404) continue;
    if (loginRes.status !== 200) throw new Error(`Credenciais inválidas (HTTP ${loginRes.status})`);
    cookie = (loginRes.cookies as string[]).map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error("Login retornou HTTP 200 mas sem cookie de sessão");
    csrf = extractCsrf(loginRes.body);
    base = candidateBase;
    break;
  }
  if (!cookie) throw new Error("Endpoint de login não encontrado — verifique IP e porta do controlador");

  // 2. Device list
  const devRes = await httpsGetCookie(controllerIp, port, `${base}/api/s/${site}/stat/device`, cookie, tlsVerify, csrf);
  if (devRes.status === 404) throw new Error(`Site "${site}" não encontrado (HTTP 404)`);
  const devices = ((devRes.body as { data?: InformDevice[] })?.data ?? []);
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

  // 3. Clients
  const clientsRes = await httpsGetCookie(controllerIp, port, `${base}/api/s/${site}/stat/sta`, cookie, tlsVerify, csrf);
  const allClients = ((clientsRes.body as { data?: InformClient[] })?.data ?? []);
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

  // 5. Uplink rate via two-sample Δbytes
  let uplinkTxBps: number | null = null;
  let uplinkRxBps: number | null = null;
  const snap1 = deviceBytes(ap);
  if (snap1) {
    await new Promise((r) => setTimeout(r, 1_000));
    try {
      const devRes2 = await httpsGetCookie(controllerIp, port, `${base}/api/s/${site}/stat/device`, cookie, tlsVerify, csrf);
      const devices2 = ((devRes2.body as { data?: InformDevice[] })?.data ?? []);
      const ap2 = devices2.find((d) => d.ip === apIp) ?? (devices2.length === 1 ? devices2[0] : undefined);
      const snap2 = ap2 ? deviceBytes(ap2) : null;
      if (snap2) {
        uplinkTxBps = Math.max(0, snap2.tx - snap1.tx) * 8;
        uplinkRxBps = Math.max(0, snap2.rx - snap1.rx) * 8;
      }
    } catch { /* non-fatal */ }
  }

  return {
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
