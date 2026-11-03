"use client";
import { useEffect, useState } from "react";
import type { AvailabilityReport } from "@/lib/report-availability";

export interface SlaState {
  report: AvailabilityReport | null;
  loading: boolean;
  error: string | null;
}

/** Busca GET /api/reports?month=YYYY-MM; `loader` substitui a rede (mock). */
export function useSla(month: string, loader?: (month: string) => AvailabilityReport): SlaState {
  const [state, setState] = useState<SlaState>({ report: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    if (loader) {
      setState({ report: loader(month), loading: false, error: null });
      return () => { alive = false; };
    }
    fetch(`/api/reports?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as AvailabilityReport;
      })
      .then((report) => alive && setState({ report, loading: false, error: null }))
      .catch((e: unknown) => alive && setState({ report: null, loading: false, error: e instanceof Error ? e.message : "erro" }));
    return () => { alive = false; };
  }, [month, loader]);
  return state;
}

const CELL: Record<string, string> = { ok: "", partial: "c-part", down: "c-down", nodata: "c-nd", future: "c-fut" };
const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;

/** Faixa de SLA mensal: uma linha por link, uma célula por dia (ok/partial/down/nodata/future). */
export function SlaStrip({ state }: { state: SlaState }) {
  const { report, loading, error } = state;
  if (loading && !report) return <div className="dim">carregando SLA…</div>;
  if (error || !report) return <div className="empty" role="alert">SLA indisponível ({error ?? "sem dados"}).</div>;
  if (!report.links.length) return <div className="empty">Nenhum link para exibir no mês.</div>;
  const cols = { gridTemplateColumns: `repeat(${report.days}, minmax(0, 1fr))` };
  return (
    <div data-testid="sla-strip">
      <div className="sla-row">
        <span />
        <div className="sla-days" style={cols}>
          {Array.from({ length: report.days }, (_, i) => <span key={i}>{i === 0 || (i + 1) % 5 === 0 ? i + 1 : ""}</span>)}
        </div>
        <span />
      </div>
      {report.links.map((l) => {
        const lastPast = l.perDay.filter((d) => d.state !== "future").length;
        const pct = l.availabilityPct;
        return (
          <div className="sla-row" key={l.id} data-testid="sla-link">
            <span>{l.site ?? "?"} {l.name}</span>
            <div className="cells" style={cols}>
              {l.perDay.map((d, i) => (
                <span key={d.day} className={`${CELL[d.state] ?? ""}${i + 1 === lastPast ? " c-today" : ""}`.trim()} data-state={d.state} title={`dia ${d.day}: ${d.state}`} />
              ))}
            </div>
            <span>
              {pct == null ? <span className="dim">sem dados</span> : <span className={l.metTarget ? "ok" : "crit"}>{pct.toFixed(2)}% {l.metTarget ? "✔" : "✖"}</span>}{" "}
              <span className="dim">{hm(l.downtimeSec)} fora</span>
            </span>
          </div>
        );
      })}
      <div className="sla-legend">
        <span><i className="legend-sw" style={{ background: "var(--ok)" }} />disponível</span>
        <span><i className="legend-sw" style={{ background: "var(--warn)" }} />queda parcial</span>
        <span><i className="legend-sw" style={{ background: "var(--crit)" }} />indisponível</span>
        <span><i className="legend-sw" style={{ background: "repeating-linear-gradient(135deg,var(--faint) 0 2px,transparent 2px 5px)" }} />sem dado</span>
        <span><i className="legend-sw" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} />futuro</span>
        <span>meta {report.target}%</span>
      </div>
    </div>
  );
}
