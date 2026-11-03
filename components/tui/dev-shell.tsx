"use client";
/**
 * Primitivas das telas de dispositivos/rede (prefixo dev-, não editam components/tui/* existentes):
 *  - DevStyles: injeta DEV_CSS (também necessário dentro de portais como o drawer).
 *  - DevPage: contêiner `.tui` com cabeçalho (voltar, título, estado "ao vivo", ações) e rodapé de atalhos.
 *  - DevEmpty / DevError / DevLoading: estados de vazio, erro e carregando consistentes.
 *  - useListKeys: atalhos j/k/↑/↓ (mover), Enter (abrir), / (buscar) e ? (ajuda) para listas.
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { HelpOverlay, KeyHints } from "@/components/tui";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { DEV_CSS } from "@/components/tui/dev.css";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useNow } from "@/hooks/use-now";
import { fmtAge } from "@/lib/tui-format";

export function DevStyles() {
  return <style>{DEV_CSS}</style>;
}

/** Escopo `.tui` inline (sem padding/fundo próprios) para componentes usados fora de uma DevPage: cards, drawers, portais. */
export function DevScope({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`tui ${className}`.trim()} style={{ padding: 0, minHeight: 0, background: "transparent" }}>
      <DevStyles />
      {children}
    </div>
  );
}

interface DevPageProps {
  title: string;
  sub?: ReactNode;
  back?: string;
  backLabel?: string;
  /** Mostra "● ao vivo" com a idade dos dados. */
  live?: boolean;
  lastUpdated?: Date | null;
  actions?: ReactNode;
  hints?: KeyHint[];
  help?: HelpRow[];
  helpOpen?: boolean;
  onHelpClose?: () => void;
  children: ReactNode;
}

export function DevPage({ title, sub, back, backLabel = "voltar", live, lastUpdated, actions, hints, help, helpOpen, onHelpClose, children }: DevPageProps) {
  const now = useNow();
  const age = lastUpdated && now ? Math.max(0, (now - lastUpdated.getTime()) / 1000) : null;
  return (
    <div className="tui">
      <DevStyles />
      <div className="d-page">
        <header className="d-head">
          {back ? (
            <Link href={back} className="d-back" aria-label={`Voltar: ${backLabel}`}>
              ‹ {backLabel}
            </Link>
          ) : null}
          <h1>{title}</h1>
          {sub ? <span className="d-sub">{sub}</span> : null}
          <span className="spacer" />
          {live ? (
            <span className="d-live">
              <span className="ok">●</span> ao vivo · {age == null ? "—" : fmtAge(age)}
            </span>
          ) : null}
          {actions ? <div className="d-acts">{actions}</div> : null}
        </header>
        {children}
        {hints ? <KeyHints hints={hints} /> : null}
        {helpOpen && help && onHelpClose ? <HelpOverlay rows={help} onClose={onHelpClose} /> : null}
      </div>
    </div>
  );
}

export function DevEmpty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="d-empty" role="status">
      <div className="ttl">░ {title}</div>
      {hint ? <div>{hint}</div> : null}
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  );
}

export function DevError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="d-err" role="alert">
      <span>✖ {message}</span>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function DevLoading({ rows = 6, label = "carregando…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="d-skel" style={{ width: `${95 - ((i * 13) % 40)}%` }} />
      ))}
    </div>
  );
}

interface ListKeysOptions {
  count: number;
  onOpen: (index: number) => void;
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Teclas extras (ex.: "n": novo). */
  extra?: Record<string, () => void>;
  enabled?: boolean;
}

/** Seleção de linha por teclado + ajuda. Retorna o índice selecionado e o estado da ajuda. */
export function useListKeys({ count, onOpen, searchRef, extra, enabled = true }: ListKeysOptions) {
  const [selRaw, setSel] = useState(0);
  const [help, setHelp] = useState(false);
  const sel = Math.min(selRaw, Math.max(0, count - 1));
  const map = useMemo(() => {
    const move = (d: number) => () => setSel((s) => Math.max(0, Math.min(count - 1, Math.min(s, count - 1) + d)));
    return {
      j: move(1),
      ArrowDown: move(1),
      k: move(-1),
      ArrowUp: move(-1),
      Enter: () => {
        if (count > 0) onOpen(sel);
      },
      "/": () => searchRef?.current?.focus(),
      "?": () => setHelp((h) => !h),
      Escape: (e: KeyboardEvent) => {
        if (help) setHelp(false);
        else if (document.activeElement instanceof HTMLInputElement) {
          document.activeElement.blur();
          e.preventDefault();
        }
      },
      ...Object.fromEntries(Object.entries(extra ?? {}).map(([k, fn]) => [k, () => fn()])),
    };
  }, [count, sel, onOpen, searchRef, extra, help]);
  useHotkeys(map, enabled);
  useEffect(() => {
    if (!enabled) return;
    document.querySelector(`[data-row-idx="${sel}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [sel, enabled]);
  return { sel, setSel, help, setHelp };
}
