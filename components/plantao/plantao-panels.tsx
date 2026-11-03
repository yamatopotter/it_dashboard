"use client";
import type { ReactNode, RefObject } from "react";
import { Age, Bar, Panel, Spark, StateGlyph } from "@/components/tui";
import { findEntity } from "@/components/tower/tower-actions";
import { SITE_NAMES, type SiteKey } from "@/lib/modules";
import type { TowerEvent, TowerProblem, TowerSiteSummary, TowerSnapshot } from "@/lib/tower-types";
import { GLYPH, SEVERITY_LABEL, fmtHM, type GlyphKey } from "@/lib/tui-format";
import { availBuckets, unitStatus, type SearchResult, type Tier } from "./plantao-logic";

const isAck = (p: TowerProblem) => p.severity === "ack" || p.acknowledged;

/** CSS próprio do Plantão (escopado em .tui), complementa o globals.css. */
export const PLANTAO_CSS = `
.tui .g-plantao { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.tui .search { display: flex; align-items: center; gap: 8px; }
.tui .search label { color: var(--accent-2); font-weight: 700; }
.tui .search input { flex: 1; min-width: 0; background: transparent; border: 0; border-bottom: 1px solid var(--line); color: var(--fg); font: inherit; padding: 2px 0; }
.tui .search input:focus { outline: none; border-bottom-color: var(--accent-2); }
.tui .res { grid-template-columns: 5ch minmax(0, 1fr); }
.tui .unit-box.focus { border-color: var(--accent-2); }
.tui .u-sec { display: flex; flex-direction: column; gap: 2px; }
.tui .u-sec + .u-sec { border-top: 1px dashed var(--line); margin-top: 6px; padding-top: 6px; }
.tui .u-link { grid-template-columns: minmax(6ch, 1fr) auto; }
.tui .u-gw { grid-template-columns: auto minmax(40px, 1fr) 6ch; cursor: default; }
.tui .cnt { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 12px; padding: 0 6px; }
.tui .tier { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 6px 6px 2px; cursor: default; }
.tui .prob2 { grid-template-columns: 2ch 5ch 4ch minmax(14ch, 1.2fr) minmax(10ch, 1fr) 7ch minmax(0, 1.5fr) minmax(0, 1.3fr); }
.tui .prob2.ackd { color: var(--dim); }
.tui .avail { display: flex; gap: 1px; height: 12px; margin-block: 4px 2px; }
.tui .avail i { flex: 1; background: var(--ok); border-radius: 1px; }
.tui .avail i.c { background: var(--crit); }
.tui .avail-scale { display: flex; justify-content: space-between; color: var(--dim); font-size: 11px; }
.tui .unit-tabs { display: none; gap: 4px; padding-top: 4px; }
@media (max-width: 900px) {
  .tui .g-plantao { grid-template-columns: 1fr; }
  .tui .unit-tabs { display: flex; }
  .tui .m-hide { display: none; }
  .tui .prob2 { grid-template-columns: 2ch 5ch 4ch minmax(0, 1fr) 7ch; }
  .tui .prob2 .c-what, .tui .prob2 .c-note, .tui .prob2 .c-imp { display: none; }
}
`;

export function SearchPanel({ inputRef, value, onChange, results, onPick }: {
  inputRef: RefObject<HTMLInputElement | null>; value: string; onChange: (v: string) => void; results: SearchResult[]; onPick: (r: SearchResult) => void;
}) {
  const q = value.trim();
  return (
    <Panel title="BUSCA" sub="dispositivo, AP, link, IP ou unidade" color="accent2" full right={<><kbd>/</kbd> busca</>}>
      <div className="search">
        <label htmlFor="plantao-q">/</label>
        <input
          id="plantao-q" ref={inputRef} type="search" autoComplete="off" spellCheck={false}
          placeholder="digite um nome, IP ou unidade" value={value} onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="rows">
        {!q ? <div className="row muted"><span>busca em links, dispositivos e APs</span></div> : null}
        {q && results.length === 0 ? <div className="row muted"><span>{`nada encontrado para "${q}"`}</span></div> : null}
        {results.map((r) => (
          <div key={r.key} className="row res" data-testid="search-result" tabIndex={0} onClick={() => onPick(r)}
            onKeyDown={(e) => { if (e.key === "Enter") onPick(r); }}>
            <span className="dim">{r.kind}</span>
            <span><b>{r.name}</b> {r.site ?? "?"} · <span className={r.level}>{r.stateText}</span>{r.detail ? ` · ${r.detail}` : ""}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function UnitPanel({ index, summary, snap, focus, hidden, fetchedAt, onToggle, onPickLink }: {
  index: number; summary: TowerSiteSummary; snap: TowerSnapshot; focus: boolean; hidden: boolean; fetchedAt: number | null;
  onToggle: () => void; onPickLink: (id: string) => void;
}) {
  const site = summary.site;
  const st = unitStatus(snap.problems, site);
  const links = snap.links.filter((l) => l.site === site);
  const gateways = snap.devices.filter((d) => d.site === site && d.type === "MIKROTIK");
  const title = site ? `[${index}] ${SITE_NAMES[site].toUpperCase()}` : "[?] SEM UNIDADE";
  const devCls = summary.devicesOffline ? "crit" : summary.devicesSuppressed ? "warn" : "ok";
  return (
    <Panel
      title={title}
      color={st.level === "ok" ? "accent2" : st.level}
      hot={st.level === "crit"}
      focus={focus}
      className={`unit-box${hidden ? " m-hide" : ""}`}
      id={`unit-${site ?? "none"}`}
      right={
        <button type="button" aria-pressed={focus} aria-label={`Destacar ${site ? SITE_NAMES[site] : "sem unidade"}`} onClick={onToggle}>
          <b className={st.level}>{st.text}</b>
        </button>
      }
    >
      {links.length > 0 ? (
        <div className="u-sec">
          {links.map((l) => (
            <div key={l.id} className="row u-link" data-testid="unit-link" onClick={() => onPickLink(l.id)}>
              <span title={l.name}>{l.name}</span>
              {l.isOnline ? <Bar pct={l.usagePct} label={`uso de ${l.name}`} /> : <span className="crit">✖ DOWN <Age sec={l.downForSec} at={fetchedAt} /></span>}
            </div>
          ))}
        </div>
      ) : null}
      {gateways.length > 0 ? (
        <div className="u-sec">
          {gateways.map((g) => (
            <div key={g.id} className="row u-gw" data-testid="unit-gw">
              <span>
                {g.name} <StateGlyph state={g.state === "ok" ? "ok" : g.state === "crit" ? "crit" : "unk"} label={g.state} />
                {g.cpuPct != null ? ` cpu ${g.cpuPct}%` : ""}
              </span>
              <span>{g.spark.length > 1 ? <Spark values={g.spark} height={18} label={`resposta de ${g.name}`} /> : null}</span>
              <span className="dim">{g.responseMs != null ? `${g.responseMs}ms` : "—"}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="u-sec cnt">
        <span>
          disp <span className={devCls}>{summary.devicesOnline}/{summary.devicesTotal}</span>
          {summary.devicesSuppressed ? <span className="dim">{` (+${summary.devicesSuppressed} sob o link)`}</span> : null}
        </span>
        <span>AP <span className={summary.apsOnline < summary.apsTotal ? "warn" : "ok"}>{summary.apsOnline}/{summary.apsTotal}</span></span>
      </div>
    </Panel>
  );
}

export function UnitTabs({ items, active, onPick }: { items: { site: SiteKey; status: string; level: string }[]; active: SiteKey; onPick: (s: SiteKey) => void }) {
  return (
    <div className="full unit-tabs" role="tablist" aria-label="Unidade">
      {items.map((it, i) => (
        <button key={it.site} type="button" role="tab" className="chip" aria-selected={active === it.site} onClick={() => onPick(it.site)}>
          <kbd>{i + 1}</kbd> {SITE_NAMES[it.site]} <span className={it.level}>{it.status}</span>
        </button>
      ))}
    </div>
  );
}

export function QueuePanel({ groups, selId, fetchedAt, site, onSelect }: {
  groups: { tier: Tier; items: TowerProblem[] }[]; selId: string | null; fetchedAt: number | null; site: string; onSelect: (id: string) => void;
}) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <Panel id="box-prob" title="PROBLEMAS AGORA" sub={`(${total}) por causa provável: link › gateway › sw/AP › ponta${site !== "ALL" ? ` · só ${site}` : ""}`}
      color="crit" hot={groups.some((g) => g.items.some((p) => p.severity === "crit"))} full>
      <div className="rows">
        {total === 0 ? <div className="row muted"><span className="ok">{`✔ nenhum problema${site !== "ALL" ? ` em ${site}` : ""}`}</span></div> : null}
        {groups.map((g) => (
          <div key={g.tier} style={{ display: "contents" }}>
            <div className="tier">{g.tier}</div>
            {g.items.map((p) => {
              const ack = isAck(p);
              const glyph: GlyphKey = ack ? "ack" : p.severity;
              const cls = ack ? "dim" : p.severity === "info" ? "info" : p.severity;
              return (
                <div key={p.id} className={`row prob2${p.id === selId ? " sel" : ""}${ack ? " ackd" : ""}`} data-testid="problem-row" tabIndex={0}
                  aria-selected={p.id === selId} onClick={() => onSelect(p.id)}>
                  <span className={cls}>{GLYPH[glyph]}</span>
                  <span className={cls}>{ack ? "ACK" : SEVERITY_LABEL[p.severity]}</span>
                  <span>{p.site ?? "?"}</span>
                  <span>{p.name}</span>
                  <span className="c-what">{p.what}</span>
                  <Age sec={p.sinceSec} at={fetchedAt} />
                  <span className="c-note dim">{ack && p.ackBy ? `${p.ackBy}: "${p.ackNote ?? "sem nota"}"` : p.why}</span>
                  <span className={`c-imp ${p.children.length ? "warn" : "dim"}`}>{p.children.length ? `afeta ${p.children.length} disp.` : ""}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function PlantaoDetail({ problem, snap, fetchedAt, actions }: { problem: TowerProblem; snap: TowerSnapshot; fetchedAt: number | null; actions: ReactNode }) {
  const e = findEntity(problem, snap);
  const rows: [string, ReactNode][] = [];
  let spark: number[] = [];
  let avail: number | null = null;
  if (e?.kind === "LINK") {
    const l = e.link;
    rows.push(["estado", l.isOnline ? `${l.usagePct ?? "—"}% do contratado` : <span key="s" className="crit">DOWN há <Age sec={l.downForSec} at={fetchedAt} /></span>]);
    rows.push(["anterior", l.lastDownAt ? new Date(l.lastDownAt).toLocaleString("pt-BR") : "sem quedas registradas"]);
    rows.push(["7 dias", `${l.drops7d} quedas`]);
    rows.push(["notas", l.description ?? "sem descrição"]);
    if (l.gatewayName) rows.push(["medição", `${l.gatewayName} ${l.mikrotikInterface ?? ""}`.trim()]);
    spark = l.spark;
    avail = l.availability24h;
  } else if (e?.kind === "DISP") {
    const d = e.device;
    rows.push(["ip", `${d.ip} · ${d.type} · ${d.site ?? "?"}`]);
    rows.push(["falhas", `${d.consecutiveFailures} seguidas`]);
    if (d.suppressedByLinkId) rows.push(["causa", snap.links.find((l) => l.id === d.suppressedByLinkId)?.name ?? d.suppressedByLinkId]);
    spark = d.spark;
  } else if (e?.kind === "AP") {
    rows.push(["ap", `${e.ap.vendor} · canal ${e.ap.channel ?? "—"} · ${e.ap.clients ?? "—"} clientes`]);
  }
  if (problem.acknowledged) rows.push(["notas", `ack ${problem.ackBy ?? "?"}: ${problem.ackNote ?? "sem nota"}`]);
  rows.push(["impacto", problem.children.length ? <span key="i" className="warn">afeta {problem.children.length} disp. · {problem.why}</span> : problem.why]);
  const buckets = availBuckets(spark);
  return (
    <Panel id="box-detail" title="DETALHE" sub={`· ${problem.name} (${problem.site ? SITE_NAMES[problem.site] : "?"})`} color="accent" full right={<><kbd>esc</kbd> fecha</>}>
      <div className="detail-body">
        <dl className="kv">
          {rows.map(([k, v]) => (<div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>))}
        </dl>
        <div>
          <div className="dim">disponibilidade 24h · <span className={avail != null && avail < 99 ? "warn" : "ok"}>{avail != null ? `${avail.toFixed(2)}%`.replace(".", ",") : "sem dados"}</span></div>
          {buckets.length ? (
            <>
              <div className="avail" role="img" aria-label="disponibilidade nas últimas 24 horas">{buckets.map((b, i) => <i key={i} className={b === "c" ? "c" : undefined} />)}</div>
              <div className="avail-scale"><span>-24h</span><span>-12h</span><span>agora</span></div>
            </>
          ) : null}
          {actions}
        </div>
      </div>
    </Panel>
  );
}

const EV_GLYPH: Record<TowerEvent["severity"], GlyphKey> = { crit: "crit", warn: "warn", ok: "ok", info: "info" };
export function PlantaoEvents({ events }: { events: TowerEvent[] }) {
  return (
    <Panel title="EVENTOS" sub="últimas horas" color="dim" full>
      <div className="ev">
        {events.length === 0 ? <span className="dim">sem eventos recentes</span> : null}
        {events.map((e) => (
          <span key={e.id}><span className="dim">{fmtHM(e.at)}</span> <StateGlyph state={EV_GLYPH[e.severity]} label={e.severity} /> {e.text}</span>
        ))}
      </div>
    </Panel>
  );
}
