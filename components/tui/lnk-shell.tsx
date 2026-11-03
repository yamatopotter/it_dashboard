"use client";
// Casca comum das telas padronizadas (links, incidentes, visão geral, celulares, computadores):
// container .tui, cabeçalho de página (título, subtítulo, frescor dos dados), rodapé de atalhos e ajuda (?).
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpOverlay } from "@/components/tui/help-overlay";
import { KeyHints } from "@/components/tui/key-hints";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { Age } from "@/components/tui/age";
import { LNK_CSS } from "@/components/tui/lnk-styles";
import { useNow } from "@/hooks/use-now";

interface LnkShellProps {
  title: string;
  sub?: ReactNode;
  /** Link "← voltar" exibido antes do título. */
  back?: { href: string; label: string };
  /** Último carregamento (frescor dos dados); null enquanto carrega; omitido = sem indicador. */
  updatedAt?: Date | null;
  /** Intervalo de polling em ms, para marcar dados velhos (3x). */
  pollMs?: number;
  /** Conteúdo extra à direita do cabeçalho (botões). */
  actions?: ReactNode;
  hints: KeyHint[];
  help: HelpRow[];
  helpOpen: boolean;
  onHelpClose: () => void;
  children: ReactNode;
}

/** Indicador "dados ● 12s": verde enquanto fresco, vermelho piscando se passou de 3 intervalos. */
export function LnkLive({ updatedAt, pollMs }: { updatedAt: Date | null; pollMs?: number }) {
  const now = useNow();
  if (!updatedAt) return <span className="dim">dados ◌ …</span>;
  const sec = now ? Math.max(0, (now - updatedAt.getTime()) / 1000) : 0;
  const stale = pollMs ? sec * 1000 > pollMs * 3 : false;
  return (
    <span>
      dados <span className={stale ? "crit blink" : "ok"}>{stale ? "✖" : "●"}</span> <Age sec={sec} at={now || undefined} />
    </span>
  );
}

export function LnkShell({ title, sub, back, updatedAt, pollMs, actions, hints, help, helpOpen, onHelpClose, children }: LnkShellProps) {
  return (
    <div className="tui lnk">
      <style>{LNK_CSS}</style>
      <header className="lnk-head">
        {back ? (
          <Link href={back.href} className="back">
            ← {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {sub ? <span>{sub}</span> : null}
        <span className="spacer" />
        {updatedAt !== undefined ? <LnkLive updatedAt={updatedAt} pollMs={pollMs} /> : null}
        {actions}
      </header>
      <div className="stack">{children}</div>
      <KeyHints hints={hints} />
      {helpOpen ? <HelpOverlay rows={help} onClose={onHelpClose} /> : null}
    </div>
  );
}
