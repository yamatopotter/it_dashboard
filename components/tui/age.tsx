"use client";
import { useState } from "react";
import { useNow } from "@/hooks/use-now";
import { fmtAge } from "@/lib/tui-format";

interface AgeProps {
  /** Segundos medidos no instante `at`. */
  sec: number | null;
  /** Instante local (ms) em que `sec` foi recebido; padrão: quando `sec` mudou pela última vez. */
  at?: number | null;
  className?: string;
}

/** Idade formatada (14m22s) que avança a cada segundo sem refetch. */
export function Age({ sec, at, className }: AgeProps) {
  const now = useNow();
  // Marca o instante em que `sec` chegou (ajuste de estado durante o render, sem ref nem Date.now).
  const [snap, setSnap] = useState({ sec, at: now });
  if (snap.sec !== sec || (!snap.at && now)) setSnap({ sec, at: now });
  if (sec == null) return <span className={className}>—</span>;
  const base = at ?? snap.at;
  const extra = now && base ? Math.max(0, (now - base) / 1000) : 0;
  return <span className={className}>{fmtAge(sec + extra)}</span>;
}
