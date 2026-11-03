"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Panel } from "@/components/tui/panel";
import { TuiPage } from "@/components/tui/page";
import { EmptyBox, StatusBadge, type BadgeLevel } from "@/components/tui/states";
import type { Finding, Status, SeverityLevel } from "./page";

const SEVERITY_LEVEL: Record<SeverityLevel, BadgeLevel> = {
  CRÍTICO: "crit",
  ALTO: "crit",
  MÉDIO: "warn",
  BAIXO: "info",
  INFO: "dim",
};

const SEVERITY_ORDER: SeverityLevel[] = ["CRÍTICO", "ALTO", "MÉDIO", "BAIXO", "INFO"];

const STATUS_CONFIG: Record<Status, { label: string; cls: string; glyph: string }> = {
  ABERTO: { label: "Aberto", cls: "tui-crit", glyph: "✖" },
  ACEITO: { label: "Aceito", cls: "tui-warn", glyph: "▲" },
  RESOLVIDO: { label: "Resolvido", cls: "tui-ok", glyph: "●" },
};

type Filter = "TODOS" | Status;

interface Props {
  findings: Finding[];
  lastUpdated?: string;
}

export function SecurityClient({ findings, lastUpdated }: Props) {
  const [filter, setFilter] = useState<Filter>("TODOS");
  const resolved = findings.filter((f) => f.status === "RESOLVIDO").length;
  const open = findings.filter((f) => f.status === "ABERTO").length;
  const accepted = findings.filter((f) => f.status === "ACEITO").length;
  const total = findings.length;
  const pct = total ? Math.round((resolved / total) * 100) : 0;
  const bySev = (a: Finding, b: Finding) => SEVERITY_ORDER.indexOf(a.severityLevel) - SEVERITY_ORDER.indexOf(b.severityLevel);

  const sorted = (["ABERTO", "ACEITO", "RESOLVIDO"] as Status[]).flatMap((st) => findings.filter((f) => f.status === st).sort(bySev));
  const shown = filter === "TODOS" ? sorted : sorted.filter((f) => f.status === filter);
  const FILTERS: [Filter, string, number][] = [
    ["TODOS", "todos", total],
    ["ABERTO", "abertos", open],
    ["ACEITO", "aceitos", accepted],
    ["RESOLVIDO", "resolvidos", resolved],
  ];

  return (
    <>
      <Topbar title="Segurança" icon={ShieldCheck} subtitle={lastUpdated ? `Atualizado em ${lastUpdated}` : undefined} />

      <TuiPage>
        <div className="tui-stack">
          <Panel title="situação" color={open > 0 ? "crit" : "ok"} hot={open > 0}>
            <div className="tui-kpis">
              <div className="tui-kpi"><span className="tui-kpi-l">total de achados</span><b className="tui-kpi-v">{total}</b></div>
              <div className="tui-kpi"><span className="tui-kpi-l">✖ abertos</span><b className={`tui-kpi-v${open ? " tui-crit" : ""}`}>{open}</b></div>
              <div className="tui-kpi"><span className="tui-kpi-l">▲ aceitos</span><b className={`tui-kpi-v${accepted ? " tui-warn" : ""}`}>{accepted}</b></div>
              <div className="tui-kpi"><span className="tui-kpi-l">● resolvidos</span><b className="tui-kpi-v tui-ok">{resolved}</b></div>
            </div>
            <div className="barwrap" style={{ marginTop: 12, width: "100%" }}>
              <span className="tui-dim" style={{ whiteSpace: "nowrap" }}>resolução</span>
              <span className="bar" style={{ flex: 1, ["--p" as string]: pct }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso de resolução">
                <i />
              </span>
              <span className="pct">{pct}%</span>
            </div>
          </Panel>

          <Panel title="achados" sub={`${shown.length}`} color="info">
            <div className="tui-tabs" role="group" aria-label="Filtrar por status" style={{ marginBottom: 10 }}>
              {FILTERS.map(([k, label, n]) => (
                <button key={k} type="button" className="tui-tab" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label} {n}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <EmptyBox title="Nenhum achado nesse filtro." />
            ) : (
              <div className="tui-table-wrap">
                <table className="tui-table" aria-label="Achados de segurança">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Achado</th>
                      <th className="hidden sm:table-cell">Categoria</th>
                      <th>Severidade</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((f) => {
                      const st = STATUS_CONFIG[f.status];
                      return (
                        <tr key={f.id} style={f.status === "RESOLVIDO" ? { opacity: 0.7 } : undefined}>
                          <td className="tui-dim" style={{ whiteSpace: "nowrap" }}>{f.id}</td>
                          <td>
                            {f.title}
                            {f.resolvedIn && <div className="tui-dim" style={{ fontSize: 11 }}>resolvido em: {f.resolvedIn}</div>}
                          </td>
                          <td className="tui-dim hidden sm:table-cell">{f.category}</td>
                          <td><StatusBadge level={SEVERITY_LEVEL[f.severityLevel]}>{f.severityLevel}</StatusBadge></td>
                          <td className={st.cls} style={{ whiteSpace: "nowrap" }}>
                            <span aria-hidden="true">{st.glyph} </span>
                            {st.label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <p className="tui-hint">
            Fonte: SECURITY_REPORT.md · gerado diretamente do relatório de segurança, sem depender do banco de dados.
          </p>
        </div>
      </TuiPage>
    </>
  );
}
