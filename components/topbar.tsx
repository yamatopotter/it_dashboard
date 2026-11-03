"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { CountdownBadge } from "@/components/countdown-badge";

interface TopbarProps {
  title: string;
  badge?: React.ReactNode;
  subtitle?: string;
  icon?: React.ElementType;
  back?: string;
  backLabel?: string;
  live?: boolean;
  pollIntervalMs?: number;
  lastUpdated?: Date | null;
  children?: React.ReactNode;
  className?: string;
}

/** Cabeçalho padrão de página (estilo TUI): voltar, título com marcador, subtítulo, ao vivo/contagem e ações. */
export function Topbar({
  title,
  badge,
  subtitle,
  icon: Icon,
  back,
  backLabel,
  live = false,
  pollIntervalMs,
  lastUpdated,
  children,
  className,
}: TopbarProps) {
  return (
    <header className={cn("tui-head", className)}>
      <div className="tui-head-l">
        {back && (
          <Link href={back} aria-label={backLabel ?? "Voltar"} className="tui-back">
            <span aria-hidden="true">←</span>
            {backLabel && <span>{backLabel}</span>}
          </Link>
        )}
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="tui-title">{title}</h1>
            {badge}
          </div>
          {subtitle && <p className="tui-subtitle">{subtitle}</p>}
        </div>
      </div>

      <div className="tui-head-r">
        {live && (
          <span className="hidden sm:inline-flex items-center gap-1 tui-ok font-semibold select-none">
            <span aria-hidden="true">●</span>
            Ao vivo
          </span>
        )}
        {pollIntervalMs != null && <CountdownBadge intervalMs={pollIntervalMs} lastUpdated={lastUpdated ?? null} />}
        {children}
      </div>
    </header>
  );
}
