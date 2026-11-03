import { withRouterOS } from "../connections/routeros-pool";

export interface LinkTrafficResult {
  downloadBps: number;
  uploadBps: number;
}

interface Sample { rx: number; tx: number; at: number }

// Last counters read per (router, interface), so the next tick can compute the
// rate from the real elapsed time instead of sleeping 1 s between two reads.
const lastSamples = new Map<string, Sample>();

const MIN_ELAPSED_MS = 1_000;        // shorter windows are too noisy → fall back
const MAX_SAMPLE_AGE_MS = 5 * 60_000; // older samples no longer represent "current" traffic

export function resetLinkSamples(): void { lastSamples.clear(); }

// /interface/monitor-traffic doesn't accept =count= via API.
// We read /interface/print rx-byte/tx-byte and compute Δbytes×8/Δt against the
// previous tick's sample. Only the first sample (or a stale / regressed counter,
// e.g. after a reboot) falls back to two reads 1 second apart.
export async function checkLinkTraffic(
  ip: string,
  user: string,
  password: string,
  port: number,
  iface: string,
): Promise<LinkTrafficResult> {
  return withRouterOS({ host: ip, port, user, password }, async (run) => {
    const readCounters = async (): Promise<Sample> => {
      const rows = await run("/interface/print", ["=.proplist=name,rx-byte,tx-byte"]);
      const row = rows.find((r) => r.name === iface);
      if (!row) throw new Error(`Interface "${iface}" não encontrada no dispositivo`);
      return { rx: Number(row["rx-byte"]) || 0, tx: Number(row["tx-byte"]) || 0, at: Date.now() };
    };

    const key = `${ip}:${port}:${user}:${iface}`;
    const now = await readCounters();
    const prev = lastSamples.get(key);
    lastSamples.set(key, now);

    if (prev) {
      const elapsed = now.at - prev.at;
      const regressed = now.rx < prev.rx || now.tx < prev.tx;
      if (!regressed && elapsed >= MIN_ELAPSED_MS && elapsed <= MAX_SAMPLE_AGE_MS) {
        return {
          downloadBps: Math.round(((now.rx - prev.rx) * 8 * 1000) / elapsed),
          uploadBps:   Math.round(((now.tx - prev.tx) * 8 * 1000) / elapsed),
        };
      }
    }

    // Fallback: first sample, regressed counter or stale sample
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const after = await readCounters();
    lastSamples.set(key, after);
    const elapsed = Math.max(1, after.at - now.at);
    return {
      downloadBps: Math.max(0, Math.round(((after.rx - now.rx) * 8 * 1000) / elapsed)),
      uploadBps:   Math.max(0, Math.round(((after.tx - now.tx) * 8 * 1000) / elapsed)),
    };
  });
}
