// DES-UI004: centralized ping/status color logic used across devices page and cards

export function getPingColor(ms: number | null | undefined): string {
  if (ms == null) return "text-muted-foreground";
  if (ms < 50) return "text-success";
  if (ms < 150) return "text-warning";
  return "text-destructive";
}

export function getPingDot(ms: number | null | undefined): string {
  if (ms == null) return "bg-muted-foreground/30";
  if (ms < 50) return "bg-success";
  if (ms < 150) return "bg-warning";
  return "bg-destructive";
}

export function getCpuColor(pct: number): string {
  if (pct < 60) return "bg-success";
  if (pct < 85) return "bg-warning";
  return "bg-destructive";
}

export function getMemoryColor(pct: number): string {
  if (pct < 70) return "bg-primary/60";
  if (pct < 90) return "bg-warning";
  return "bg-destructive";
}
