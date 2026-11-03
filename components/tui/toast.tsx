"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Toast de uma mensagem que some sozinho; `show(msg)` dispara. */
export function useToast(ms = 2600) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => setMsg(null), ms);
    },
    [ms],
  );
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return { msg, show };
}

/** Renderiza a mensagem do toast (região de status para leitores de tela). */
export function Toast({ msg }: { msg: string | null }) {
  return (
    <div className="toast" role="status" aria-live="polite" hidden={!msg}>
      {msg}
    </div>
  );
}
