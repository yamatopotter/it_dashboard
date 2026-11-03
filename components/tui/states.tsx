import type { ReactNode } from "react";

export type BadgeLevel = "ok" | "warn" | "crit" | "info" | "dim";
const GLYPH: Record<BadgeLevel, string> = { ok: "●", warn: "▲", crit: "✖", info: "·", dim: "◌" };

/** Badge de estado com glifo (nunca só cor): `<StatusBadge level="crit">offline</StatusBadge>`. */
export function StatusBadge({ level, children, glyph = true }: { level: BadgeLevel; children: ReactNode; glyph?: boolean }) {
  return (
    <span className={`tui-badge tui-badge-${level}`}>
      {glyph ? <span aria-hidden="true">{GLYPH[level]}</span> : null}
      {children}
    </span>
  );
}

/** Estado vazio: título em destaque + dica opcional/ação. */
export function EmptyBox({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="tui-empty" role="status">
      <b>{title}</b>
      {hint ? <span>{hint}</span> : null}
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
    </div>
  );
}

/** Estado de erro com ação de repetir. */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="tui-error" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="tui-btn tui-btn-sm" onClick={onRetry}>
          tentar de novo
        </button>
      ) : null}
    </div>
  );
}

/** Linhas de carregamento (esqueleto) para tabelas/listas. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando" style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="tui-skel" style={{ width: `${88 - ((i * 13) % 40)}%` }} />
      ))}
    </div>
  );
}

/** Campo de formulário: rótulo + controle + dica/erro, ligados por id (acessível). */
export function Field({ id, label, hint, error, full, children }: { id: string; label: string; hint?: ReactNode; error?: string | null; full?: boolean; children: ReactNode }) {
  return (
    <div className={`tui-field${full ? " tui-full" : ""}`}>
      <label className="tui-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="tui-err" id={`${id}-err`}>
          {error}
        </p>
      ) : hint ? (
        <p className="tui-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
