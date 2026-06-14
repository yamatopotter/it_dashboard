"use client";

import { ShieldCheck, CheckCircle2, AlertCircle, MinusCircle } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import type { Finding, Status, SeverityLevel } from "./page";

const SEVERITY_BADGE: Record<SeverityLevel, string> = {
  CRÍTICO: "bg-destructive/10 text-destructive border-destructive/20",
  ALTO:    "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  MÉDIO:   "bg-warning/10 text-warning border-warning/20",
  BAIXO:   "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  INFO:    "bg-muted text-muted-foreground border-border",
};

const SEVERITY_ORDER: SeverityLevel[] = ["CRÍTICO", "ALTO", "MÉDIO", "BAIXO", "INFO"];

const STATUS_CONFIG: Record<Status, { label: string; color: string; Icon: React.ElementType }> = {
  ABERTO:    { label: "Aberto",    color: "text-destructive", Icon: AlertCircle  },
  ACEITO:    { label: "Aceito",    color: "text-warning",     Icon: MinusCircle  },
  RESOLVIDO: { label: "Resolvido", color: "text-success",     Icon: CheckCircle2 },
};

interface Props {
  findings: Finding[];
  lastUpdated?: string;
}

export function SecurityClient({ findings, lastUpdated }: Props) {
  const resolved = findings.filter((f) => f.status === "RESOLVIDO").length;
  const open     = findings.filter((f) => f.status === "ABERTO").length;
  const accepted = findings.filter((f) => f.status === "ACEITO").length;
  const total    = findings.length;

  const sorted = [
    ...findings.filter((f) => f.status === "ABERTO").sort((a, b) => SEVERITY_ORDER.indexOf(a.severityLevel) - SEVERITY_ORDER.indexOf(b.severityLevel)),
    ...findings.filter((f) => f.status === "ACEITO").sort((a, b) => SEVERITY_ORDER.indexOf(a.severityLevel) - SEVERITY_ORDER.indexOf(b.severityLevel)),
    ...findings.filter((f) => f.status === "RESOLVIDO").sort((a, b) => SEVERITY_ORDER.indexOf(a.severityLevel) - SEVERITY_ORDER.indexOf(b.severityLevel)),
  ];

  return (
    <>
      <Topbar
        title="Segurança"
        icon={ShieldCheck}
        subtitle={lastUpdated ? `Atualizado em ${lastUpdated}` : undefined}
      />

      <div className="p-7 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border shadow-none">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Total de achados</p>
              <p className="text-3xl font-extrabold tabular-nums">{total}</p>
            </CardContent>
          </Card>
          <Card className="border shadow-none bg-destructive/5">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3 text-destructive" /> Abertos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-destructive">{open}</p>
            </CardContent>
          </Card>
          <Card className="border shadow-none bg-warning/5">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <MinusCircle className="h-3 w-3 text-warning" /> Aceitos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-warning">{accepted}</p>
            </CardContent>
          </Card>
          <Card className="border shadow-none bg-success/5">
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-success" /> Resolvidos
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-success">{resolved}</p>
            </CardContent>
          </Card>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso de resolução</span>
            <span className="font-semibold text-foreground">{Math.round((resolved / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div className="h-full bg-success transition-all" style={{ width: `${(resolved / total) * 100}%` }} />
            <div className="h-full bg-warning/60 transition-all" style={{ width: `${(accepted / total) * 100}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Verde = resolvidos · Amarelo = aceitos como risco residual · Cinza = abertos
          </p>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm" aria-label="Achados de segurança">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Achado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Categoria</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Severidade</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((f) => {
                const { label, color, Icon } = STATUS_CONFIG[f.status];
                return (
                  <tr key={f.id} className={f.status === "RESOLVIDO" ? "opacity-60" : ""}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{f.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm leading-snug">{f.title}</p>
                      {f.resolvedIn && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Resolvido em: <span className="font-mono">{f.resolvedIn}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">{f.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${SEVERITY_BADGE[f.severityLevel]}`}>
                        {f.severityEmoji} {f.severityLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Fonte: <span className="font-mono">SECURITY_REPORT.md</span> · Esta tela é gerada diretamente do relatório de segurança e não depende do banco de dados.
        </p>
      </div>
    </>
  );
}
