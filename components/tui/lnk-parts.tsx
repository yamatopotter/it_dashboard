"use client";
// Peças pequenas compartilhadas pelas telas padronizadas: filtros em chips, estados vazio/erro/carregando e campo de formulário.
import type { ReactNode } from "react";

export interface ChipDef<T extends string> {
  value: T;
  label: string;
  /** Tecla de atalho exibida no chip (o handler fica na tela). */
  key?: string;
  count?: number;
}

/** Grupo de filtros (aria-pressed) no estilo dos chips da barra de topo. */
export function LnkChips<T extends string>({ label, chips, value, onChange }: { label: string; chips: ChipDef<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <span className="chips" role="group" aria-label={label}>
      {chips.map((c) => (
        <button key={c.value} type="button" className="chip" aria-pressed={value === c.value} onClick={() => onChange(c.value)}>
          {c.key ? <kbd>{c.key}</kbd> : null} {c.label}
          {c.count != null ? ` ${c.count}` : ""}
        </button>
      ))}
    </span>
  );
}

/** Chip de alternância (liga/desliga). */
export function LnkToggle({ label, on, onToggle, k }: { label: string; on: boolean; onToggle: () => void; k?: string }) {
  return (
    <span className="chips">
      <button type="button" className="chip" aria-pressed={on} onClick={onToggle}>
        {k ? <kbd>{k}</kbd> : null} {label}
      </button>
    </span>
  );
}

export function LnkLoading({ what = "dados" }: { what?: string }) {
  return (
    <p className="note" role="status">
      <span className="dim">◌</span> carregando {what}…
    </p>
  );
}

export function LnkEmpty({ ok, title, hint, action }: { ok?: boolean; title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="note">
      <div className={ok ? "ok-n" : undefined}>
        {ok ? "● " : "░ "}
        {title}
      </div>
      {hint ? <div className="dim">{hint}</div> : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  );
}

export function LnkError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="note crit-n" role="alert">
      ✖ {message}{" "}
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          tentar de novo
        </button>
      ) : null}
    </div>
  );
}

/** Campo de formulário com rótulo, dica e erro associados. */
export function LnkField({ id, label, error, hint, full, children }: { id: string; label: string; error?: string; hint?: string; full?: boolean; children: ReactNode }) {
  return (
    <div className={`fld${full ? " full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error ? (
        <span className="hint" id={`${id}-h`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="err" id={`${id}-e`} role="alert">
          ✖ {error}
        </span>
      ) : null}
    </div>
  );
}
