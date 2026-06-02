import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  isOnline: boolean;
  className?: string;
}

export function StatusBadge({ isOnline, className }: StatusBadgeProps) {
  return (
    <Badge
      variant={isOnline ? "default" : "destructive"}
      className={cn("gap-1.5", className)}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current opacity-70",
          isOnline && "animate-pulse"
        )}
      />
      {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}
