import { cn } from "@/lib/utils";

type StatusValue = "online" | "offline" | "degraded" | "acknowledged";

interface StatusBadgeProps {
  isOnline: boolean;
  degraded?: boolean;
  acknowledged?: boolean;
  className?: string;
}

const STATUS_STYLES: Record<StatusValue, string> = {
  online:       "bg-success/10 text-success border border-success/20",
  offline:      "bg-destructive/10 text-destructive border border-destructive/20",
  degraded:     "bg-warning/10 text-warning border border-warning/20",
  acknowledged: "bg-muted text-muted-foreground border border-border",
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
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold",
        STATUS_STYLES[status],
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-1.5 w-1.5 rounded-full bg-current",
          status === "online" && "animate-ping-dot"
        )}
      />
      <span aria-hidden="true">{STATUS_LABELS[status]}</span>
    </span>
  );
}
