"use client";
import { useRef } from "react";
import { useNow } from "@/hooks/use-now";
import { fmtAge } from "@/lib/tui-format";

interface AgeProps {
  /** Segundos medidos no instante `at`. */
  sec: number | null;
  /** Instante local (ms) em que `sec` foi recebido; padrão: montagem do componente. */
  at?: number | null;
  className?: string;
}

/** Idade formatada (14m22s) que avança a cada segundo sem refetch. */
export function Age({ sec, at, className }: AgeProps) {
  const now = useNow();
  const mounted = useRef<number>(0);
  if (!mounted.current && now) mounted.current = now;
  if (sec == null) return <span className={className}>—</span>;
  const base = at ?? mounted.current;
  const extra = now && base ? Math.max(0, (now - base) / 1000) : 0;
  return <span className={className}>{fmtAge(sec + extra)}</span>;
}
