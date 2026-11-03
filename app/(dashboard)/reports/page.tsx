"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Printer, Loader2, Table2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { exportToPdf } from "@/lib/pdf-export";
import { SITE_NAMES, isSiteKey } from "@/lib/modules";
import { buildAvailabilityCsv, formatDowntime } from "@/lib/report-csv";
import type { AvailabilityReport } from "@/app/api/reports/route";
import type { DayAvailability, DayState } from "@/lib/sla";

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const TARGETS = [99, 99.5, 99.9];

function currentMonthKey(): string {
  // America/Sao_Paulo = UTC-3 (sem horário de verão)
  const d = new Date(Date.now() - 3 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

const siteName = (s: string | null) => (isSiteKey(s) ? SITE_NAMES[s] : "Sem unidade");
const fmtPct = (v: number | null) => (v == null ? "sem dado" : `${v.toFixed(v >= 99.995 || v === 0 ? 0 : 3).replace(".", ",")}%`);

const STATE_CLASS: Record<DayState, string> = {
  ok: "bg-success",
  partial: "bg-warning",
  down: "bg-destructive",
  nodata: "bg-muted-foreground/40",
  future: "border border-dashed border-border bg-transparent",
};

function dayLabel(d: DayAvailability): string {
  switch (d.state) {
    case "ok": return `dia ${d.day}: sem queda`;
    case "partial": return `dia ${d.day}: queda de ${formatDowntime(d.downtimeSec)}`;
    case "down": return `dia ${d.day}: fora o dia todo (${formatDowntime(d.downtimeSec)})`;
    case "nodata": return `dia ${d.day}: sem dado`;
    default: return `dia ${d.day}: sem medição (futuro)`;
  }
}

function DayStrip({ perDay, link }: { perDay: DayAvailability[]; link: string }) {
  return (
    <div role="list" aria-label={`Faixa diária de ${link}`} className="flex gap-[2px]">
      {perDay.map(d => (
        <span
          key={d.day}
          role="listitem"
          title={dayLabel(d)}
          aria-label={dayLabel(d)}
          className={`h-5 min-w-[6px] flex-1 rounded-[2px] ${STATE_CLASS[d.state]}`}
        />
      ))}
    </div>
  );
}

function Legend() {
  const items: Array<[DayState, string]> = [
    ["ok", "sem queda"], ["partial", "parcial"], ["down", "queda"], ["nodata", "sem dado"], ["future", "sem medição (futuro)"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([s, label]) => (
        <li key={s} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3 w-3 rounded-[2px] ${STATE_CLASS[s]}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function AvailabilityBar({ pct, met }: { pct: number | null; met: boolean | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">sem dado</span>;
  return (
    <div className="flex items-center gap-2 min-w-[130px]">
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden" aria-hidden>
        <div className={`h-full ${met ? "bg-success" : "bg-destructive"}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className={`text-sm font-semibold tabular-nums ${met ? "" : "text-destructive"}`}>{fmtPct(pct)}</span>
    </div>
  );
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonthKey);
  const [target, setTarget] = useState(99.5);
  const [report, setReport] = useState<AvailabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?month=${month}&target=${target}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Erro ao carregar o relatório.");
        setReport(null);
        return;
      }
      setReport(await res.json());
    } catch {
      setError("Erro de rede ao carregar o relatório.");
    } finally {
      setLoading(false);
    }
  }, [month, target]);

  useEffect(() => { load(); }, [load]);

  async function handleExportPdf() {
    if (!reportRef.current) return;
    setExportingPdf(true);
    try {
      await exportToPdf(reportRef.current);
    } catch (err) {
      setError(`Erro ao gerar PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportingPdf(false);
    }
  }

  function handleDownloadCsv() {
    if (!report) return;
    const csv = buildAvailabilityCsv(report, siteName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `disponibilidade-${report.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isCurrent = month === currentMonthKey();
  const below = report?.links.filter(l => l.metTarget === false) ?? [];

  return (
    <>
      <Topbar title="Disponibilidade mensal" icon={FileText} subtitle="Links de internet, rede e Wi-Fi — SLA do mês" />

      <div className="p-7 space-y-6">
        <div className="no-print flex flex-wrap items-end gap-3 p-4 bg-card border border-border rounded-xl">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mês</p>
            <div className="flex items-center gap-1">
              <button aria-label="Mês anterior" onClick={() => setMonth(m => shiftMonth(m, -1))}
                className="h-9 w-9 rounded-lg border border-border hover:bg-muted flex items-center justify-center">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                type="month"
                aria-label="Selecionar mês"
                value={month}
                max={currentMonthKey()}
                onChange={e => e.target.value && setMonth(e.target.value)}
                className="h-9 px-3 rounded-lg border border-border bg-background text-sm"
              />
              <button aria-label="Próximo mês" disabled={isCurrent} onClick={() => setMonth(m => shiftMonth(m, 1))}
                className="h-9 w-9 rounded-lg border border-border hover:bg-muted disabled:opacity-40 flex items-center justify-center">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meta de disponibilidade</p>
            <div className="flex gap-1">
              {TARGETS.map(t => (
                <button key={t} onClick={() => setTarget(t)}
                  className={`px-3 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    target === t ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}>
                  {String(t).replace(".", ",")}%
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 ml-auto">
            <button onClick={handleExportPdf} disabled={!report || exportingPdf}
              className="h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 flex items-center gap-2">
              {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {exportingPdf ? "Gerando PDF..." : "Exportar PDF"}
            </button>
            <button onClick={handleDownloadCsv} disabled={!report}
              className="h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 flex items-center gap-2">
              <Table2 className="h-4 w-4" /> Exportar CSV
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="no-print px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {!loading && report && (
          <div ref={reportRef} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold capitalize">Disponibilidade de {monthLabel(report.month)}</h2>
              <p className="text-sm text-muted-foreground">
                Meta: {String(report.target).replace(".", ",")}%
                {isCurrent && " · mês em andamento: dias futuros ainda não medidos"}
                {" · fuso America/São Paulo"}
              </p>
            </div>

            {/* Resumo por unidade */}
            <section aria-label="Resumo por unidade" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.units.map(u => (
                <div key={u.site} className={`rounded-xl border p-4 bg-card ${u.metTarget === false ? "border-destructive/40" : "border-border"}`}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{u.name}</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${u.metTarget === false ? "text-destructive" : ""}`}>{fmtPct(u.availabilityPct)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {u.linkCount} link{u.linkCount !== 1 ? "s" : ""} · {u.drops} queda{u.drops !== 1 ? "s" : ""} · fora {formatDowntime(u.downtimeSec)}
                  </p>
                  {u.linksBelowTarget > 0 && (
                    <p className="text-xs text-destructive font-medium mt-1">{u.linksBelowTarget} abaixo da meta</p>
                  )}
                </div>
              ))}
            </section>

            {below.length > 0 && (
              <div role="status" className="flex items-start gap-2 px-4 py-3 rounded-lg border border-destructive/30 bg-destructive/10 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <span>
                  <strong>{below.length} link{below.length !== 1 ? "s" : ""} abaixo da meta:</strong>{" "}
                  {below.map(l => `${l.name} (${fmtPct(l.availabilityPct)})`).join(", ")}
                </span>
              </div>
            )}

            {/* Links */}
            <section aria-label="Links" className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Links de internet</h3>
                <Legend />
              </div>
              {report.links.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Nenhum link cadastrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                        <th className="px-4 py-2 font-semibold">Link</th>
                        <th className="px-4 py-2 font-semibold">Disponibilidade</th>
                        <th className="px-4 py-2 font-semibold">Fora</th>
                        <th className="px-4 py-2 font-semibold">Quedas</th>
                        <th className="px-4 py-2 font-semibold">Maior queda</th>
                        <th className="px-4 py-2 font-semibold min-w-[320px]">Dia a dia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.links.map(l => (
                        <tr key={l.id} className={`border-b border-border/60 last:border-0 ${l.metTarget === false ? "bg-destructive/5" : ""}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{l.name}</p>
                            <p className="text-xs text-muted-foreground">{siteName(l.site)}</p>
                          </td>
                          <td className="px-4 py-3"><AvailabilityBar pct={l.availabilityPct} met={l.metTarget} /></td>
                          <td className="px-4 py-3 tabular-nums">{formatDowntime(l.downtimeSec)}</td>
                          <td className="px-4 py-3 tabular-nums">{l.drops}</td>
                          <td className="px-4 py-3 tabular-nums">{l.longestDropSec > 0 ? formatDowntime(l.longestDropSec) : "—"}</td>
                          <td className="px-4 py-3"><DayStrip perDay={l.perDay} link={l.name} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Rede e Wi-Fi */}
            <section aria-label="Rede e Wi-Fi" className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-semibold">Rede e Wi-Fi — menor disponibilidade</h3>
                <p className="text-xs text-muted-foreground">
                  Proporção de verificações online (Mikrotik, switches e APs). Top 10
                  {report.devices.withoutData > 0 && ` · ${report.devices.withoutData} sem dado no mês`}
                </p>
              </div>
              {report.devices.worst.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">Sem verificações registradas no período.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {report.devices.worst.map(d => (
                    <li key={d.id} className="px-4 py-2.5 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{siteName(d.site)} · {d.type.replace("_", " ")}</p>
                      </div>
                      <AvailabilityBar pct={d.availabilityPct} met={d.availabilityPct >= report.target} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
