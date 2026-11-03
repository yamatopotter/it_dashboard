import * as https from "https";

// One keep-alive agent per (host, port, tlsVerify): TLS sessions are reused across
// requests instead of a new handshake for every call. tlsVerify is part of the key
// so a verified and an unverified client never share sockets.
const agents = new Map<string, https.Agent>();

export function getAgent(host: string, port: number, tlsVerify: boolean): https.Agent | undefined {
  // Guard for environments where https is mocked without Agent (unit tests)
  if (typeof https.Agent !== "function") return undefined;
  const key = `${host}:${port}:${tlsVerify ? 1 : 0}`;
  let a = agents.get(key);
  if (!a) {
    a = new https.Agent({ keepAlive: true, keepAliveMsecs: 15_000, maxSockets: 4, maxFreeSockets: 2, timeout: 60_000 });
    agents.set(key, a);
  }
  return a;
}

export function destroyAllAgents(): void {
  for (const a of agents.values()) { try { a.destroy(); } catch { /* ignore */ } }
  agents.clear();
}
