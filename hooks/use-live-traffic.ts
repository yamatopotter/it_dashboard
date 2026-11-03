"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveSample {
  downloadBps: number;
  uploadBps: number;
  timestamp: string;
}

const MAX_SAMPLES = 30;
export const LIVE_INTERVAL_MS = 3_000;

/** Medição de tráfego em tempo real de um link (GET /api/links/[id]/live-traffic a cada 3s, até 30 amostras). */
export function useLiveTraffic(id: string) {
  const [active, setActive] = useState(false);
  const [samples, setSamples] = useState<LiveSample[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);

  const measureOnce = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setMeasuring(true);
    try {
      const res = await fetch(`/api/links/${id}/live-traffic`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Erro desconhecido"); return; }
      setError(null);
      setSamples((prev) => {
        const next = [...prev, json as LiveSample];
        return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
      });
    } catch {
      setError("Falha ao conectar à API");
    } finally {
      busy.current = false;
      setMeasuring(false);
    }
  }, [id]);

  const stop = useCallback(() => {
    setActive(false);
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  const start = useCallback(() => {
    setActive(true);
    setSamples([]);
    setError(null);
    void measureOnce();
    timer.current = setInterval(() => void measureOnce(), LIVE_INTERVAL_MS);
  }, [measureOnce]);

  const toggle = useCallback(() => { if (timer.current) stop(); else start(); }, [start, stop]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  return { active, samples, measuring, error, start, stop, toggle };
}
