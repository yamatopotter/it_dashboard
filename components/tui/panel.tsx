import type { CSSProperties, ReactNode } from "react";

export type PanelColor = "ok" | "warn" | "crit" | "info" | "accent" | "accent2" | "dim";

const COLOR_VAR: Record<PanelColor, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
  info: "var(--info)",
  accent: "var(--accent)",
  accent2: "var(--accent-2)",
  dim: "var(--dim)",
};

interface PanelProps {
  title: string;
  /** Texto fraco ao lado do título. */
  sub?: ReactNode;
  /** Canto direito da borda (atalho ou botão). */
  right?: ReactNode;
  color?: PanelColor;
  /** Borda vermelha (há problema crítico). */
  hot?: boolean;
  /** Painel com foco: borda na cor do painel. */
  focus?: boolean;
  full?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Painel estilo btop: borda CSS com o título sobreposto. Funciona em qualquer página (classes globais .tui-panel*). */
export function Panel({ title, sub, right, color = "info", hot, focus, full, id, className = "", children }: PanelProps) {
  const labelId = id ? `${id}-t` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={labelId}
      className={`box tui-panel${hot ? " hot" : ""}${focus ? " focus" : ""}${full ? " full tui-full" : ""} ${className}`.trim()}
      style={{ "--box": COLOR_VAR[color] } as CSSProperties}
    >
      <h2 className="box-t tui-panel-t" id={labelId}>
        <span>{title}</span>
        {sub ? <span className="sub">{sub}</span> : null}
      </h2>
      {right ? <span className="box-r tui-panel-r">{right}</span> : null}
      {children}
    </section>
  );
}
