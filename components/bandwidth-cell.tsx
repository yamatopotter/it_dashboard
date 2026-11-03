"use client";

import { Bar } from "@/components/tui/bar";
import { formatBps } from "@/lib/format";

/**
 * Tráfego atual vs banda contratada no padrão TUI: valor, barra com % ao lado (ok <70, aviso 70-90, crítico >=90)
 * e o teto contratado. Deve ser renderizado dentro de um container `.tui.lnk`.
 * `color` distingue download (success) de upload (primary) apenas no valor.
 */
export function BandwidthCell({ current, contracted, color, label }: {
  current: number | null;
  contracted: number | null;
  color: "success" | "primary";
  label?: string;
}) {
  if (current == null) return <span className="dim">sem dados</span>;
  const pct = contracted && contracted > 0 ? Math.min((current / contracted) * 100, 100) : null;
  return (
    <span className="bw">
      <span className={`v ${color === "success" ? "ok" : "info"}`}>{formatBps(current)}</span>
      {contracted != null && (
        <>
          <Bar pct={pct} width="8ch" label={label ?? "uso da banda contratada"} />
          <span className="of">/ {formatBps(contracted)}</span>
        </>
      )}
    </span>
  );
}
