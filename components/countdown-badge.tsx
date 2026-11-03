"use client";

import { useNow } from "@/hooks/use-now";

interface CountdownBadgeProps {
  intervalMs: number;
  lastUpdated: Date | null;
}

/** "próximo em 12s": contagem regressiva até o próximo polling, movida pelo relógio compartilhado (useNow). */
export function CountdownBadge({ intervalMs, lastUpdated }: CountdownBadgeProps) {
  const now = useNow();
  if (!lastUpdated || !now) return null;
  const remaining = Math.max(0, Math.ceil((intervalMs - (now - lastUpdated.getTime())) / 1000));
  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums select-none">
      próximo em <span className="font-semibold text-foreground min-w-[3ch] text-right">{remaining}s</span>
    </span>
  );
}
