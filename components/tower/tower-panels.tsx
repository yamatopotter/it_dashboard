"use client";
import type { ReactNode } from "react";
import { Age, Bar, Dots, Panel, Spark, StateGlyph } from "@/components/tui";
import type { SiteFilter } from "@/components/tui";
import { SITE_NAMES } from "@/lib/modules";
import type { TowerEvent, TowerLink, TowerProblem, TowerSiteSummary, TowerSnapshot } from "@/lib/tower-types";
import { GLYPH, SEVERITY_LABEL, fmtHM, fmtMbps, pctLevel, type GlyphKey } from "@/lib/tui-format";
import { findEntity } from "./tower-actions";

const siteTag = (s: string | null) => s ?? "?";
const isAck = (p: TowerProblem) => p.severity === "ack" || p.acknowledged;
const sevClass = (p: TowerProblem) => (isAck(p) ? "dim" : p.severity === "info" ? "info" : p.severity);

interface ProblemsProps {
  list: TowerProblem[];
  selId: string | null;
  expanded: Set<string>;
  fetchedAt: number | null;
  canAct: boolean;
  onlyProblems: boolean;
  allOk: ReactNode;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onAct: (id: string, act: "a" | "s" | "c") => void;
  onToggleOnly: () => void;
  footer?: ReactNode;
}

/** Fila de exceções: gravidade, idade, dependentes agrupados e linha de ack. */
export function ProblemsPanel({ list, selId, expanded, fetchedAt, canAct, onlyProblems, allOk, onSelect, onToggleExpand, onAct, onToggleOnly, footer }: ProblemsProps) {
  return (
    <Panel
      id="box-prob"
      title="PROBLEMAS"
      sub="gravidade › idade"
      color="crit"
      hot={list.some((p) => p.severity === "crit")}
      full
      right={
        <button type="button" aria-pressed={onlyProblems} onClick={onToggleOnly} title="Mostrar só os problemas (celular, TV)">
          <kbd>f</kbd> só problemas
        </button>
      }
    >
      <div className="rows">
        {list.length === 0 ? <div className="allok">{allOk}</div> : null}
        {list.map((p) => {
          const ack = isAck(p);
          const glyph: GlyphKey = ack ? "ack" : p.severity;
          const open = expanded.has(p.id);
          return (
            <div key={p.id} style={{ display: "contents" }}>
              <div
                className={`row prob${p.id === selId ? " sel" : ""}${ack ? " ackd" : ""}`}
                data-testid="problem-row"
                tabIndex={0}
                aria-selected={p.id === selId}
                onClick={() => onSelect(p.id)}
              >
                <span className={sevClass(p)}>{GLYPH[glyph]}</span>
                <span className={`sev c-sev ${sevClass(p)}`}>{ack ? "ACK" : SEVERITY_LABEL[p.severity]}</span>
                <span className="c-kind dim">{p.kind}</span>
                <span>{siteTag(p.site)}</span>
                <span>{p.name}</span>
                <span className="c-what">{p.what}</span>
                <Age className="age" sec={p.sinceSec} at={fetchedAt} />
                <span className="c-why dim">{ack && p.ackBy ? `${p.ackBy}: "${p.ackNote ?? "sem nota"}"` : p.why}</span>
                <span className="acts">
                  {canAct ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onAct(p.id, "a"); }}>
                      a {ack ? "desfazer ack" : "ack"}
                    </button>
                  ) : null}
                  {canAct ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onAct(p.id, "s"); }}>
                      s silenciar
                    </button>
                  ) : null}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onAct(p.id, "c"); }}>
                    c copiar
                  </button>
                </span>
              </div>
              {p.children.length > 0 ? (
                <button type="button" className="row child" aria-expanded={open} onClick={() => onToggleExpand(p.id)}>
                  {`└ +${p.children.length} dependentes de ${siteTag(p.site)} agrupados sob ${p.kind === "LINK" ? "o link" : "este item"} · ${open ? "clique para recolher" : "clique para expandir (nunca somem)"}`}
                </button>
              ) : null}
              {open
                ? p.children.map((c) => (
                    <div key={c.id} className="row child muted">
                      {`   ◌ ${c.name} · sem resposta (suprimido)`}
                    </div>
                  ))
                : null}
            </div>
          );
        })}
      </div>
      {footer}
    </Panel>
  );
}

/** Links com barra de uso vs contratado. */
export function LinksPanel({ links, fetchedAt, onPick }: { links: TowerLink[]; fetchedAt: number | null; onPick: (l: TowerLink) => void }) {
  return (
    <Panel title="LINKS" sub="↓ atual / contratado" color="info" className="hide-f">
      <div className="rows">
        {links.length === 0 ? <div className="dim">nenhum link</div> : null}
        {links.map((l) => (
          <div key={l.id} className="row lnk" data-testid="link-row" onClick={() => onPick(l)}>
            <span>{siteTag(l.site)}</span>
            <span title={l.name}>{l.name}</span>
            <span className="dim">{fmtMbps(l.contractedDownBps)}</span>
            {l.isOnline ? (
              <Bar pct={l.usagePct} label={`uso de ${l.name}`} />
            ) : (
              <span className="crit">
                ✖ DOWN <Age sec={l.downForSec} at={fetchedAt} />
              </span>
            )}
            <span className={l.isOnline ? pctLevel(l.usagePct) : "dim"}>{l.isOnline ? fmtMbps(l.downBps) : ""}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Unidades: 1 ponto por dispositivo; grupo "?" para itens sem unidade. */
export function UnitsPanel({ sites, site, onSite }: { sites: TowerSiteSummary[]; site: SiteFilter; onSite: (s: SiteFilter) => void }) {
  const shown = sites.filter((s) => (site === "ALL" ? true : s.site === site));
  return (
    <Panel title="UNIDADES" sub="1 ponto = 1 dispositivo" color="accent2" className="hide-f">
      <div className="rows">
        {shown.map((s) => {
          const bad = s.devicesOffline + s.devicesSuppressed;
          const cls = bad ? (s.devicesOffline ? "crit" : "warn") : "ok";
          return (
            <div
              key={s.site ?? "none"}
              className={`row unit${s.site === null ? " muted" : ""}`}
              data-testid="unit-row"
              onClick={() => s.site && onSite(s.site)}
            >
              <span>{s.site ? SITE_NAMES[s.site].toUpperCase() : "?"}</span>
              <Dots states={s.dots} />
              <span className={cls}>{s.site ? `${s.devicesOnline}/${s.devicesTotal}` : `${s.devicesTotal} s/ unidade`}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** Detalhe inline do problema selecionado. */
export function DetailPanel({ problem, snap, fetchedAt, actions }: { problem: TowerProblem; snap: TowerSnapshot; fetchedAt: number | null; actions: ReactNode }) {
  const e = findEntity(problem, snap);
  const rows: [string, ReactNode][] = [];
  let spark: number[] = [];
  let sparkLabel = "";
  let sparkColor = "var(--info)";

  if (e?.kind === "LINK") {
    const l = e.link;
    rows.push(["estado", l.isOnline ? <span className={pctLevel(l.usagePct)}>{l.usagePct ?? "—"}% do contratado</span> : <span className="crit">DOWN há <Age sec={l.downForSec} at={fetchedAt} /></span>]);
    rows.push(["anterior", l.lastDownAt ? new Date(l.lastDownAt).toLocaleString("pt-BR") : "sem quedas registradas"]);
    rows.push(["7 dias", `${l.drops7d} quedas · disponibilidade 24h ${l.availability24h != null ? `${l.availability24h.toFixed(2)}%` : "sem dados"}`]);
    rows.push(["notas", l.description ?? "sem descrição"]);
    if (l.gatewayName || l.mikrotikInterface) rows.push(["medição", `${l.gatewayName ?? "?"} ${l.mikrotikInterface ?? ""}`.trim()]);
    spark = l.spark;
    sparkLabel = "↓ tráfego 24h";
    sparkColor = l.isOnline ? "var(--info)" : "var(--crit)";
  } else if (e?.kind === "DISP") {
    const d = e.device;
    rows.push(["ip", `${d.ip} · ${d.type} · ${siteTag(d.site)}`]);
    rows.push(["falhas", <span key="f">{d.consecutiveFailures} seguidas{d.offlineForSec != null ? <> · offline há <Age sec={d.offlineForSec} at={fetchedAt} /></> : null}</span>]);
    if (d.responseMs != null) rows.push(["resposta", `${d.responseMs} ms${d.cpuPct != null ? ` · cpu ${d.cpuPct}%` : ""}`]);
    if (d.suppressedByLinkId) rows.push(["causa", snap.links.find((l) => l.id === d.suppressedByLinkId)?.name ?? d.suppressedByLinkId]);
    if (d.maintenanceUntil) rows.push(["silêncio", `até ${fmtHM(d.maintenanceUntil)}`]);
    spark = d.spark;
    sparkLabel = "resposta (ms)";
    sparkColor = d.state === "ok" ? "var(--info)" : "var(--crit)";
  } else if (e?.kind === "AP") {
    const a = e.ap;
    rows.push(["ap", `${a.vendor} · canal ${a.channel ?? "—"}`]);
    rows.push(["clientes", `${a.clients ?? "—"}${a.utilPct != null ? ` · uso ${a.utilPct}%` : ""}${a.signalDbm != null ? ` · ${a.signalDbm} dBm` : ""}`]);
  }
  if (problem.acknowledged) rows.push(["ack", `${problem.ackBy ?? "?"}: ${problem.ackNote ?? "sem nota"}`]);
  rows.push(["motivo", problem.why]);
  if (problem.children.length > 0) {
    rows.push([
      "correl.",
      <span key="c" className="warn">
        {problem.children.length} dispositivos de {siteTag(problem.site)} caíram junto → causa provável: este {problem.kind === "LINK" ? "link" : "item"}
      </span>,
    ]);
  }

  return (
    <Panel id="box-detail" title="DETALHE" sub={`· ${siteTag(problem.site)} ${problem.name}`} color="accent" full right={<><kbd>esc</kbd> fecha</>}>
      <div className="detail-body">
        <dl className="kv">
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          {spark.length > 1 ? (
            <>
              <div className="dim">{sparkLabel}</div>
              <Spark values={spark} color={sparkColor} height={54} label={sparkLabel} />
            </>
          ) : null}
          {actions}
        </div>
      </div>
    </Panel>
  );
}

const EV_GLYPH: Record<TowerEvent["severity"], GlyphKey> = { crit: "crit", warn: "warn", ok: "ok", info: "info" };

/** Linha do tempo das últimas horas. */
export function EventsPanel({ events }: { events: TowerEvent[] }) {
  return (
    <Panel title="EVENTOS" sub="últimas horas" color="dim" full className="hide-f">
      <div className="ev">
        {events.length === 0 ? <span className="dim">sem eventos recentes</span> : null}
        {events.map((e) => (
          <span key={e.id}>
            <span className="dim">{fmtHM(e.at)}</span> <StateGlyph state={EV_GLYPH[e.severity]} label={e.severity} /> {e.text}
          </span>
        ))}
      </div>
    </Panel>
  );
}
