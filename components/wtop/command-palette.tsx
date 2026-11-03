"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyScore } from "@/lib/wtop-filter";

export interface PaletteItem {
  id: string;
  kind: "cmd" | "link" | "disp" | "ap";
  label: string;
  run: () => void;
}

const MAX = 9;

/** Resultados da paleta: fuzzy sobre o rótulo, melhor primeiro (empate mantém a ordem original). */
export function rankItems(items: PaletteItem[], q: string): PaletteItem[] {
  return items
    .map((it, i) => ({ it, i, sc: fuzzyScore(q, it.label) }))
    .filter((x) => x.sc >= 0)
    .sort((a, b) => a.sc - b.sc || a.i - b.i)
    .slice(0, MAX)
    .map((x) => x.it);
}

interface Props {
  items: PaletteItem[];
  /** Texto inicial (":" abre vazio). */
  onClose: () => void;
}

/** Paleta de comandos (Ctrl+K ou ":"): input fuzzy sobre ativos do snapshot e comandos de navegação. */
export function CommandPalette({ items, onClose }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rankItems(items, q), [items, q]);
  const idx = Math.min(sel, Math.max(0, results.length - 1));

  useEffect(() => input.current?.focus(), []);

  const run = (it: PaletteItem | undefined) => {
    onClose();
    it?.run();
  };

  return (
    <div
      className="overlay palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="box" role="dialog" aria-modal="true" aria-label="Paleta de comandos" style={{ "--box": "var(--accent)" } as React.CSSProperties}>
        <h2 className="box-t">comandos e ativos</h2>
        <input
          ref={input}
          type="text"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={results[idx] ? `pal-${results[idx].id}` : undefined}
          aria-label="Buscar comando ou ativo"
          placeholder="digite: usuários, relatórios, nvr-02, 192.168…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel(Math.min(idx + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel(Math.max(idx - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[idx]);
            }
          }}
        />
        <div className="rows" id="pal-list" role="listbox" aria-label="Resultados">
          {results.length ? (
            results.map((it, i) => (
              <div
                key={it.id}
                id={`pal-${it.id}`}
                role="option"
                aria-selected={i === idx}
                className={`row pal${i === idx ? " sel" : ""}`}
                onClick={() => run(it)}
              >
                <span className="dim">{it.kind}</span>
                <span>{it.label}</span>
                <span className="dim">{i === idx ? "⏎" : ""}</span>
              </div>
            ))
          ) : (
            <div className="empty">nada encontrado</div>
          )}
        </div>
      </section>
    </div>
  );
}
