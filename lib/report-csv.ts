import type { AvailabilityReport } from "@/lib/report-availability";

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  // Evita injeção de fórmulas em planilhas e escapa aspas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function formatDowntime(sec: number): string {
  if (sec <= 0) return "0 min";
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** CSV de links (uma linha por link, com os dias do mês em colunas). */
export function buildAvailabilityCsv(report: AvailabilityReport, siteName: (s: string | null) => string): string {
  const header = [
    "link", "unidade", "disponibilidade_pct", "meta_pct", "meta_atingida",
    "tempo_fora_seg", "quedas", "maior_queda_seg",
    ...Array.from({ length: report.days }, (_, i) => `dia_${i + 1}`),
  ];
  const rows = report.links.map(l => [
    l.name,
    siteName(l.site),
    l.availabilityPct == null ? "" : l.availabilityPct.toFixed(3),
    report.target,
    l.metTarget == null ? "sem_dado" : l.metTarget ? "sim" : "nao",
    l.downtimeSec,
    l.drops,
    l.longestDropSec,
    ...l.perDay.map(d => (d.state === "ok" ? "ok" : `${d.state}:${d.downtimeSec}s`)),
  ]);
  return [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n");
}
