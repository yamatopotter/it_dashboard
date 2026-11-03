import { RouterOSAPI } from "routeros";
import { log } from "../../lib/logger";
import { recordConn, shortHash } from "./stats";

export type RosRow = Record<string, string>;
export type RosRun = (cmd: string, params?: string[]) => Promise<RosRow[]>;

export interface RosTarget { host: string; port: number; user: string; password: string }

const CONNECT_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 15_000;
const IDLE_CLOSE_MS = 5 * 60_000;
const SWEEP_MS = 60_000;

interface Entry {
  key: string;
  target: RosTarget;
  api: RouterOSAPI | null;
  broken: boolean;
  // tail of the per-connection mutex chain
  tail: Promise<unknown>;
  busy: number;
  lastUsed: number;
}

const pool = new Map<string, Entry>();
let sweeper: NodeJS.Timeout | null = null;

// The key never contains the password in clear text — only a short hash, so a
// changed credential gets a fresh connection.
function keyOf(t: RosTarget): string {
  return `${t.host}:${t.port}:${t.user}:${shortHash(t.password)}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout (${label})`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// A RouterOS "!trap" (e.g. permission denied) reaches us as a plain Error without
// code/errno: the TCP session is still healthy. Socket errors carry a Node `code`
// or a RosException `errno`, and our own timeouts say "Timeout" � those (and a
// session the library reports as disconnected) mean the connection must be discarded.
function isConnectionError(err: unknown, api: RouterOSAPI | null): boolean {
  if (api && (api as { connected?: boolean }).connected === false) return true;
  const e = err as { code?: unknown; errno?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (typeof e === "string") return true;
  if (e.code || e.errno) return true;
  return typeof e.message === "string" && /^Timeout|socket|ECONN|EPIPE|not connected|closed/i.test(e.message);
}

function destroy(entry: Entry): void {
  const api = entry.api;
  entry.api = null;
  entry.broken = false;
  if (api) {
    try { void Promise.resolve(api.close()).catch(() => {}); } catch { /* ignore */ }
  }
}

async function open(entry: Entry): Promise<void> {
  const { host, port, user, password } = entry.target;
  const api = new RouterOSAPI({ host, user, password, port, timeout: 10000 });
  // Without a listener, a socket error on an idle pooled connection would be an
  // unhandled 'error' event. Mark the connection broken; the next use reconnects.
  const anyApi = api as unknown as { on?: (ev: string, cb: () => void) => void };
  if (typeof anyApi.on === "function") {
    anyApi.on("error", () => { if (entry.api === api) entry.broken = true; });
    anyApi.on("close", () => { if (entry.api === api) entry.broken = true; });
  }
  try {
    await withTimeout(api.connect(), CONNECT_TIMEOUT_MS, "connect");
  } catch (err) {
    try { void Promise.resolve(api.close()).catch(() => {}); } catch { /* ignore */ }
    recordConn("routeros", "error");
    throw err;
  }
  entry.api = api;
  entry.broken = false;
  recordConn("routeros", "opened");
  ensureSweeper();
}

// Run `fn` with exclusive access to a (lazily opened, reused) RouterOS connection.
// `run` executes one command; if the pooled connection died while idle (reused and
// failing with a non-trap error) it is discarded, reopened and the command retried
// ONCE. A connection that was just opened is never retried.
export async function withRouterOS<T>(target: RosTarget, fn: (run: RosRun) => Promise<T>): Promise<T> {
  const key = keyOf(target);
  let entry = pool.get(key);
  if (!entry) {
    entry = { key, target, api: null, broken: false, tail: Promise.resolve(), busy: 0, lastUsed: Date.now() };
    pool.set(key, entry);
  }
  const e = entry;

  const prev = e.tail;
  let release!: () => void;
  e.tail = new Promise<void>((r) => { release = r; });
  e.busy++;
  try {
    await prev.catch(() => {});

    let freshlyOpened = false;
    const ensure = async () => {
      if (e.api && e.broken) destroy(e);
      if (!e.api) { await open(e); freshlyOpened = true; }
      else { recordConn("routeros", "reused"); freshlyOpened = false; }
    };
    await ensure();

    const run: RosRun = async (cmd, params) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const api = e.api!;
          const rows = await withTimeout(
            params ? api.write(cmd, params) : api.write(cmd),
            COMMAND_TIMEOUT_MS, cmd,
          );
          e.lastUsed = Date.now();
          return rows as unknown as RosRow[];
        } catch (err) {
          if (!isConnectionError(err, e.api)) throw err;
          recordConn("routeros", "error");
          const canRetry = !freshlyOpened && attempt === 0;
          destroy(e);
          if (!canRetry) throw err;
          log("warn", "[RouterOS] conexão reaproveitada falhou, reconectando", {
            ip: target.host, port: target.port,
            error: err instanceof Error ? err.message : String(err),
          });
          await ensure(); // marks freshlyOpened = true
        }
      }
    };

    return await fn(run);
  } finally {
    e.lastUsed = Date.now();
    e.busy--;
    release();
  }
}

function ensureSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, e] of pool) {
      if (e.busy === 0 && now - e.lastUsed > IDLE_CLOSE_MS) {
        destroy(e);
        pool.delete(key);
      }
    }
    if (pool.size === 0 && sweeper) { clearInterval(sweeper); sweeper = null; }
  }, SWEEP_MS);
  if (typeof sweeper === "object" && "unref" in sweeper) sweeper.unref();
}

// Close every pooled connection (graceful shutdown). Waits for in-flight commands.
export async function closeAllRouterOS(): Promise<void> {
  if (sweeper) { clearInterval(sweeper); sweeper = null; }
  const entries = [...pool.values()];
  pool.clear();
  await Promise.allSettled(entries.map(async (e) => {
    await e.tail.catch(() => {});
    destroy(e);
  }));
}

export function routerosPoolSize(): number { return pool.size; }
