"use client";
/**
 * Peças compartilhadas pelos painéis Mikrotik / Omada / UniFi (estilo TUI):
 * KpiStrip, NetAlert, UsageBar, SignalCell, PanelToggle, DevTable e useDeviceList.
 */
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";
import { usePolling } from "@/hooks/use-polling";
import { pctLevel } from "@/lib/tui-format";

export type Tone = "ok" | "warn" | "crit" | "dim";

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}

/** Faixa de KPIs: valor com glifo+cor de estado, rótulo e legenda. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="d-tiles" role="list" aria-label="Indicadores">
      {items.map((k) => (
        <div key={k.label} className="d-tile" role="listitem">
          <div className="k">{k.label}</div>
          <div className={`v ${k.tone ?? ""}`}>
            {k.tone === "warn" ? "▲ " : k.tone === "crit" ? "✖ " : ""}
            {k.value}
          </div>
          {k.sub ? <div className="dim" style={{ fontSize: 11 }}>{k.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Aviso com glifo + texto (crítico ou atenção). */
export function NetAlert({ tone, children }: { tone: "crit" | "warn"; children: ReactNode }) {
  return (
    <div className={`d-note ${tone === "crit" ? "crit" : ""}`} role={tone === "crit" ? "alert" : "status"}>
      <span className={tone}>{tone === "crit" ? "✖" : "▲"}</span> <span className={tone}>{children}</span>
    </div>
  );
}

/** Barra de uso com o percentual sempre ao lado (níveis ok/atenção/crítico). */
export function UsageBar({ value, label, width = "10ch" }: { value: number | null | undefined; label: string; width?: string }) {
  if (value == null) return <span className="faint">—</span>;
  const v = Math.max(0, Math.min(100, value));
  const lvl = pctLevel(v);
  return (
    <span className="barwrap">
      <span
        className={`bar${lvl === "crit" ? " c" : lvl === "warn" ? " w" : ""}`}
        style={{ "--p": Math.round(v), width } as CSSProperties}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
      >
        <i />
      </span>
      <span className={lvl}>{v.toFixed(0)}%</span>
    </span>
  );
}

/** Sinal Wi-Fi com glifo de qualidade. */
export function SignalCell({ signal, snr }: { signal: number | null; snr?: number | null }) {
  if (signal == null) return <span className="faint">—</span>;
  const cls = signal >= -60 ? "ok" : signal >= -75 ? "warn" : "crit";
  const glyph = signal >= -60 ? "●" : signal >= -75 ? "▲" : "✖";
  return (
    <span>
      <span className={cls}>{glyph} {signal} dBm</span>
      {snr != null ? <span className="dim"> · SNR {snr} dB</span> : null}
    </span>
  );
}

/** Bloco recolhível (botão de largura total com aria-expanded). */
export function PanelToggle({
  open, onToggle, label, count, children,
}: { open: boolean; onToggle: () => void; label: string; count?: number; children: ReactNode }) {
  return (
    <div>
      <button type="button" className="d-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? "▾" : "▸"} {label}
        {count != null ? <span className="dim"> ({count})</span> : null}
      </button>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}

export interface Col<T> {
  key: string;
  head: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  right?: boolean;
  /** Se informado, o cabeçalho vira botão de ordenação. */
  onSort?: () => void;
  sorted?: boolean;
  hideSm?: boolean;
}

/** Tabela densa somente leitura (sem seleção), com cabeçalhos ordenáveis. */
export function DevTable<T>({ label, cols, rows, rowKey }: { label: string; cols: Col<T>[]; rows: T[]; rowKey: (r: T, i: number) => string }) {
  return (
    <div className="d-wrap">
      <table className="d-tbl static" aria-label={label}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`${c.right ? "r" : ""}${c.hideSm ? " hide-sm" : ""}`.trim()} aria-sort={c.onSort ? (c.sorted ? "descending" : "none") : undefined}>
                {c.onSort ? (
                  <button type="button" onClick={c.onSort}>
                    {c.head}{c.sorted ? " ↓" : ""}
                  </button>
                ) : (
                  c.head
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {cols.map((c) => (
                <td key={c.key} className={`${c.right ? "r" : ""} ${c.className ?? ""}${c.hideSm ? " hide-sm" : ""}`.trim()}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Carrega /api/devices?type=… a cada 30 s; `checkAll` dispara /api/devices/check?type=…. */
export function useDeviceList<T>(type: string, extra?: () => Promise<void>) {
  const [devices, setDevices] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/devices?type=${type}`);
      if (res.ok) {
        setDevices(await res.json());
        setError(false);
        setLastUpdated(new Date());
      } else {
        setError(true);
      }
      if (extra) await extra();
    } catch (err) {
      console.error(`[${type}] falha ao carregar dispositivos:`, err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [type, extra]);

  const checkAll = useCallback(async () => {
    setIsChecking(true);
    await fetch(`/api/devices/check?type=${type}`, { method: "POST" }).catch(() => {});
    await load();
    setIsChecking(false);
  }, [type, load]);

  usePolling(load, 30_000);

  return { devices, loading, error, lastUpdated, isChecking, checkAll, reload: load };
}
