import { cn } from "@/lib/utils";

type StatusValue = "online" | "offline" | "degraded" | "acknowledged";

interface StatusBadgeProps {
  isOnline: boolean;
  degraded?: boolean;
  acknowledged?: boolean;
  className?: string;
}

// Estado = glifo + texto + cor (nunca só cor), no mesmo vocabulário das telas TUI (● ▲ ✖ ░).
const STATUS_STYLES: Record<StatusValue, string> = {
  online:       "text-success",
  offline:      "text-destructive",
  degraded:     "text-warning",
  acknowledged: "text-muted-foreground",
};

const STATUS_GLYPH: Record<StatusValue, string> = {
  online: "●", offline: "✖", degraded: "▲", acknowledged: "░",
};

const STATUS_LABELS: Record<StatusValue, string> = {
  online:       "Online",
  offline:      "Offline",
  degraded:     "Instável",
  acknowledged: "Offline reconhecido",
};

export function StatusBadge({ isOnline, degraded = false, acknowledged = false, className }: StatusBadgeProps) {
  const status: StatusValue = isOnline
    ? (degraded ? "degraded" : "online")
    : (acknowledged ? "acknowledged" : "offline");

  return (
    <span
      role="status"
      aria-label={STATUS_LABELS[status]}
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs font-semibold whitespace-nowrap",
        STATUS_STYLES[status],
        className
      )}
    >
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      <span aria-hidden="true">{STATUS_LABELS[status]}</span>
    </span>
  );
}
