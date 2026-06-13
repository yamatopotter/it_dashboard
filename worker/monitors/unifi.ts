import { checkUnifiApiKey } from "./unifi-apikey";
import { checkUnifiInform } from "./unifi-inform";

export interface UnifiSSID {
  ssid: string;
  band: string;
  channel: number;
  clients: number;
  txBytes: number;
  rxBytes: number;
}

export interface UnifiClient {
  id: string;
  name: string;
  mac: string;
  ip: string | null;
  connectedAt: string | null;
  signal: number | null;  // dBm — only available via Inform API (user/pass)
  ssid: string | null;    // SSID name — only available via Inform API (user/pass)
}

export interface UnifiResult {
  model: string | null;
  firmware: string | null;
  uptime: number | null;
  cpuLoad: number | null;
  memoryUsed: number | null;
  uplinkTxBps: number | null;
  uplinkRxBps: number | null;
  totalClients: number;
  ssids: UnifiSSID[];
  clients: UnifiClient[];
}

export type UnifiAuth =
  | { method: "apikey"; apiKey: string }
  | { method: "userpass"; username: string; password: string };

export { discoverBase } from "./unifi-apikey";
export { checkUnifiApiKey } from "./unifi-apikey";
export { checkUnifiInform } from "./unifi-inform";

export async function checkUnifi(
  apIp: string,
  controllerIp: string,
  auth: UnifiAuth,
  port: number,
  site: string,
  tlsVerify: boolean,
): Promise<UnifiResult> {
  if (auth.method === "userpass") {
    return checkUnifiInform(apIp, controllerIp, auth.username, auth.password, port, site, tlsVerify);
  }
  return checkUnifiApiKey(apIp, controllerIp, auth.apiKey, port, site, tlsVerify);
}
