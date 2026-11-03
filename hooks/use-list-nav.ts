"use client";
import { useEffect, useState } from "react";

/**
 * Seleção de linha por teclado para listas (j/k ou ↓/↑, Home/End). Retorna o índice selecionado
 * (limitado ao tamanho atual da lista) e o mapa de teclas para passar a useHotkeys.
 * A linha selecionada deve ter `data-sel="true"` para ser rolada para a vista.
 */
export function useListNav(count: number) {
  const [raw, setSel] = useState(0);
  const sel = count === 0 ? -1 : Math.min(raw, count - 1);
  const move = (d: number) => setSel(count === 0 ? 0 : Math.max(0, Math.min(count - 1, sel + d)));
  const keys = {
    j: () => move(1),
    k: () => move(-1),
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Home: () => setSel(0),
    End: () => setSel(Math.max(0, count - 1)),
  };
  useEffect(() => {
    document.querySelector<HTMLElement>('[data-sel="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [sel]);
  return { sel, setSel, keys };
}
