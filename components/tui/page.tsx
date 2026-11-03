import type { ReactNode } from "react";

/** Corpo padrão de página: ativa os tokens/primitivas `.tui` (Panel, Bar, Dots...) com espaçamento. `narrow` limita a largura (formulários/leitura). */
export function TuiPage({ children, narrow, className = "" }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return <div className={`tui tui-page${narrow ? " tui-narrow" : ""} ${className}`.trim()}>{children}</div>;
}
