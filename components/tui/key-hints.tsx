export interface KeyHint {
  keys: string[];
  label: string;
  /** Esconde em telas pequenas. */
  hideSm?: boolean;
}

/** Rodapé fixo com os atalhos disponíveis. */
export function KeyHints({ hints }: { hints: KeyHint[] }) {
  return (
    <footer className="keys" aria-label="Atalhos de teclado">
      {hints.map((h) => (
        <span key={h.label} className={h.hideSm ? "hide-sm" : undefined}>
          {h.keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}{" "}
          {h.label}
        </span>
      ))}
    </footer>
  );
}
