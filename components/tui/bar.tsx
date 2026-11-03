import type { CSSProperties } from "react";
import { pctLevel } from "@/lib/tui-format";

interface BarProps {
  /** 0-100; null mostra a barra vazia. */
  pct: number | null;
  /** Link fora: barra hachurada e "DOWN" no lugar do percentual. */
  down?: boolean;
  /** Largura da barra (CSS), padrão 10ch. */
  width?: string;
  label?: string;
}

/** Barra de uso com níveis ok/warn/crit; o percentual fica SEMPRE ao lado. */
export function Bar({ pct, down, width = "10ch", label = "uso" }: BarProps) {
  const level = down ? "crit" : pctLevel(pct);
  const v = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
  const cls = level === "crit" ? " c" : level === "warn" ? " w" : "";
  return (
    <span className="barwrap">
      <span
        className={`bar${cls}${down ? " down" : ""}`}
        style={{ "--p": v, width } as CSSProperties}
        role="meter"
        aria-label={down ? `${label}: fora do ar` : label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
      >
        <i />
      </span>
      <span className={`pct ${down ? "crit" : level}`}>{down ? "DOWN" : pct == null ? "—" : `${v}%${v >= 90 ? "!" : ""}`}</span>
    </span>
  );
}
