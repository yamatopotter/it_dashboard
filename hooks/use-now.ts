"use client";
import { useSyncExternalStore } from "react";

// Um único relógio de 1 s compartilhado por todos os componentes (sem refetch).
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = 0;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Retorna Date.now() atualizado a cada segundo (0 no servidor, para evitar divergência de hidratação). */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!timer) current = Date.now();
      return current;
    },
    () => 0,
  );
}
