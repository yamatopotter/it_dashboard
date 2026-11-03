"use client";
import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** True se o foco está num campo de digitação (atalhos não devem disparar). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Mapa de teclas global. Ignora campos de texto (exceto Escape) e combinações com Alt/Meta. Chaves: "j", "Enter", "Ctrl+k". */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const m = ref.current;
      if (e.key === "Escape") {
        if (m.Escape) m.Escape(e);
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.metaKey) return;
      // Enter/espaço em botão ou link ativam o próprio controle.
      const tag = ((e.target as HTMLElement | null)?.tagName ?? "").toLowerCase();
      if ((e.key === "Enter" || e.key === " ") && (tag === "button" || tag === "a")) return;
      const k = (e.ctrlKey ? "Ctrl+" : "") + (e.key.length === 1 ? e.key.toLowerCase() : e.key);
      const fn = m[k];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
