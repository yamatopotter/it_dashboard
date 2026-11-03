"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TowerSnapshot } from "@/lib/tower-types";
import { useNow } from "@/hooks/use-now";

export const TOWER_POLL_MS = 5000;
export const FROZEN_AFTER_SEC = 60;

export interface UseTower {
  data: TowerSnapshot | null;
  error: string | null;
  /** Segundos desde a última resposta válida (200 ou 304). */
  ageSec: number;
  /** Instante local (ms) em que os dados mudaram pela última vez (200); base para <Age/>. */
  fetchedAt: number | null;
  /** Dados com mais de 60 s, erro sem nenhum dado ou worker stale. */
  frozen: boolean;
  refresh: () => void;
}

/** Faz polling de /api/tower a cada 5 s com ETag (trata 304), pausa com a aba oculta. Com `mock`, não faz rede. */
export function useTower(mock?: TowerSnapshot | null): UseTower {
  const [data, setData] = useState<TowerSnapshot | null>(mock ?? null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [okAt, setOkAt] = useState<number | null>(null);
  const etag = useRef<string | null>(null);
  const load = useRef<() => void>(() => {});
  const now = useNow();

  useEffect(() => {
    if (mock) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;

    const schedule = () => {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, TOWER_POLL_MS);
    };
    async function run() {
      if (!alive) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      ctrl?.abort();
      const c = new AbortController();
      ctrl = c;
      try {
        const headers: Record<string, string> = {};
        if (etag.current) headers["If-None-Match"] = etag.current;
        const res = await fetch("/api/tower", { headers, cache: "no-store", signal: c.signal });
        if (!alive) return;
        if (res.status === 304) {
          setOkAt(Date.now());
          setError(null);
        } else if (res.ok) {
          const json = (await res.json()) as TowerSnapshot;
          etag.current = res.headers.get("ETag");
          setData(json);
          setFetchedAt(Date.now());
          setOkAt(Date.now());
          setError(null);
        } else {
          setError(`HTTP ${res.status}`);
        }
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "falha de rede");
      }
      schedule();
    }
    load.current = () => {
      etag.current = null;
      void run();
    };
    const onVis = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener("visibilitychange", onVis);
    void run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mock]);

  const refresh = useCallback(() => load.current(), []);

  const ageSec = okAt && now ? Math.max(0, Math.floor((now - okAt) / 1000)) : 0;
  const frozen = mock
    ? false
    : okAt === null
      ? error !== null
      : ageSec > FROZEN_AFTER_SEC || data?.health.workerStatus === "stale";

  return { data, error, ageSec, fetchedAt, frozen, refresh };
}
