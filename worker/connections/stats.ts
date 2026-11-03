import { AsyncLocalStorage } from "async_hooks";
import { createHash } from "crypto";
import { log } from "../../lib/logger";

export type ConnProtocol = "routeros" | "omada" | "unifi";
export type ConnEvent = "opened" | "reused" | "error";

interface Trace { opened: number; reused: number }

const als = new AsyncLocalStorage<Trace>();
const counters: Record<ConnProtocol, Record<ConnEvent, number>> = {
  routeros: { opened: 0, reused: 0, error: 0 },
  omada:    { opened: 0, reused: 0, error: 0 },
  unifi:    { opened: 0, reused: 0, error: 0 },
};

// Short non-reversible fingerprint used in cache/pool keys so a secret never
// appears in clear text in memory keys, logs or error messages.
export function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

// Count a connection/session event for the periodic summary and for the
// per-call trace opened by traced().
export function recordConn(protocol: ConnProtocol, event: ConnEvent): void {
  counters[protocol][event]++;
  const t = als.getStore();
  if (t) {
    if (event === "opened") t.opened++;
    else if (event === "reused") t.reused++;
  }
}

export interface MonitorPerf { durationMs: number; reused: boolean | null }

// Run fn, measure its duration and whether it reused a connection/session
// (reused = no new connection/login was needed). Never alters fn's result or error.
export async function traced<T>(fn: () => Promise<T>, onDone: (perf: MonitorPerf) => void): Promise<T> {
  const trace: Trace = { opened: 0, reused: 0 };
  const start = Date.now();
  try {
    return await als.run(trace, fn);
  } finally {
    const used = trace.opened + trace.reused;
    onDone({ durationMs: Date.now() - start, reused: used === 0 ? null : trace.opened === 0 });
  }
}

export function snapshotAndResetStats(): typeof counters {
  const snap = JSON.parse(JSON.stringify(counters)) as typeof counters;
  for (const p of Object.keys(counters) as ConnProtocol[]) {
    counters[p] = { opened: 0, reused: 0, error: 0 };
  }
  return snap;
}

// Aggregated summary (one line per interval) — lets us compare opened vs reused
// connections in production without polluting the per-tick logs.
export function flushStats(): void {
  const snap = snapshotAndResetStats();
  const total = Object.values(snap).reduce((n, c) => n + c.opened + c.reused + c.error, 0);
  if (total === 0) return;
  log("info", "[Conexões] resumo de reuso (últimos 5 min)", snap);
}
