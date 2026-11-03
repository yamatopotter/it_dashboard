// Small shared cache with in-flight de-duplication: concurrent callers asking for
// the same key share a single fetch (one promise), and a fresh value is served
// from memory. Failed fetches are never cached.

interface Entry<T> { value: T; at: number }

export class SharedCache<T> {
  private entries = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<Entry<T>>>();

  // isFresh decides, per caller, whether a cached value can still be used.
  // hit=true means no new fetch was started by this call (cache or shared in-flight).
  async get(
    key: string,
    fetcher: () => Promise<T>,
    isFresh: (value: T, ageMs: number) => boolean,
  ): Promise<{ value: T; hit: boolean; at: number }> {
    const cached = this.entries.get(key);
    if (cached && isFresh(cached.value, Date.now() - cached.at)) {
      return { value: cached.value, hit: true, at: cached.at };
    }
    const running = this.inflight.get(key);
    if (running) {
      const e = await running;
      return { value: e.value, hit: true, at: e.at };
    }
    const p = fetcher().then((value) => {
      const e = { value, at: Date.now() };
      this.entries.set(key, e);
      return e;
    });
    this.inflight.set(key, p);
    // Clean up once settled (attach handlers so a rejection is only surfaced via `await p`)
    const clear = () => { if (this.inflight.get(key) === p) this.inflight.delete(key); };
    p.then(clear, clear);
    const e = await p;
    return { value: e.value, hit: false, at: e.at };
  }

  invalidate(key: string): void { this.entries.delete(key); }
  clear(): void { this.entries.clear(); this.inflight.clear(); }
}

// Snapshot TTL ≈ half the device check interval, clamped to 5–15 s, so APs of the
// same site polled in the same cycle share one fetch without serving stale data.
export function snapshotTtlMs(checkIntervalSec?: number): number {
  const half = (checkIntervalSec ?? 20) * 500;
  return Math.min(15_000, Math.max(5_000, half));
}
