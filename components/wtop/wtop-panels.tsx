"use client";
import type { ReactNode } from "react";
import { Age, Bar, Dots, Panel, Spark } from "@/components/tui";
import { SITE_NAMES } from "@/lib/modules";
import type { DeviceState, TowerAp, TowerDevice, TowerLink, TowerProblem, TowerSiteSummary, TowerSnapshot } from "@/lib/tower-types";
import { GLYPH, fmtAge, fmtMbps, pctLevel } from "@/lib/tui-format";
import type { SortKey, SortSpec } from "@/lib/wtop-filter";

export type Target = { type: "link" | "dev" | "ap"; id: string };

export const linkLabel = (l: TowerLink) => `${l.site ?? "?"}-${l.name}`;
const siteName = (s: string | null) => (s ? SITE_NAMES[s as keyof typeof SITE_NAMES] ?? s : "Sem unidade");
export const isAckd = (p: TowerProblem) => p.severity === "ack" || p.acknowledged;

const ST_GLYPH: Record<DeviceState, [string, string]> = {
  ok: ["●", "ok"], crit: ["✖", "crit"], sup: ["◌", "warn"], unk: ["◌", "faint"], ack: ["░", "dim"], maint: ["░", "dim"],
};
const ST_LABEL: Record<DeviceState, string> = {
  ok: "online", crit: "offline", sup: "suprimido", unk: "sem dado", ack: "reconhecido", maint: "em manutenção",
};

interface BoxProps {
  focus: boolean;
  onFocus: () => void;
}

/* ───────── 1 · links ───────── */
export function LinksPanel({ links, sel, focus, onFocus, onPick }: BoxProps & { links: TowerLink[]; sel: number; onPick: (i: number) => void }) {
  return (
    <Panel id="p1" title="¹ links" sub="↓ atual · uso · 24h" color="info" focus={focus}>
      <div className="rows" role="listbox" aria-label="Links" onClick={onFocus}>
        {links.length === 0 ? <div className="empty">nenhum link nesta sede</div> : null}
        {links.map((l, i) => {
          const cls = `row lk${i === sel ? " sel" : ""}${l.isOnline ? "" : " down"}`;
          if (!l.isOnline) {
            return (
              <div key={l.id} role="option" aria-selected={i === sel} data-testid="link-row" className={cls} onClick={() => onPick(i)}>
                <span>{linkLabel(l)}</span>
                <span className="crit">✖</span>
                <span className="crit lk-down">
                  DOWN <Age sec={l.downForSec} />
                </span>
              </div>
            );
          }
          const lvl = pctLevel(l.usagePct);
          const color = lvl === "crit" ? "var(--crit)" : lvl === "warn" ? "var(--warn)" : "var(--info)";
          return (
            <div key={l.id} role="option" aria-selected={i === sel} data-testid="link-row" className={cls} onClick={() => onPick(i)}>
              <span>{linkLabel(l)}</span>
              <span className="ok">●</span>
              <span>↓{fmtMbps(l.downBps)}</span>
              <span>
                <Bar pct={l.usagePct} width="8ch" />
              </span>
              <span className="c-spark">{l.spark.length >= 2 ? <Spark values={l.spark} color={color} height={16} /> : null}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ───────── 2 · sedes ───────── */
export function SitesPanel({ sites, sel, focus, onFocus, onPick, activeSite }: BoxProps & { sites: TowerSiteSummary[]; sel: number; onPick: (i: number) => void; activeSite: string }) {
  const sum = (f: (s: TowerSiteSummary) => number) => sites.reduce((a, s) => a + f(s), 0);
  return (
    <Panel id="p2" title="² sedes" sub="1 ponto = 1 dispositivo" color="accent2" focus={focus}>
      <div className="rows" role="listbox" aria-label="Sedes" onClick={onFocus}>
        {sites.map((s, i) => {
          const cls = s.devicesOffline ? "crit" : s.devicesSuppressed ? "warn" : "ok";
          return (
            <div
              key={s.site ?? "none"}
              role="option"
              aria-selected={i === sel}
              aria-current={activeSite === (s.site ?? "") ? "true" : undefined}
              data-testid="site-row"
              className={`row sd${i === sel ? " sel" : ""}`}
              onClick={() => onPick(i)}
            >
              <span>{s.name.toUpperCase()}</span>
              <Dots states={s.dots} />
              <span className={cls}>
                {s.devicesOnline}/{s.devicesTotal}
              </span>
              <span className="c-ap dim">
                ap {s.apsOnline}/{s.apsTotal}
              </span>
            </div>
          );
        })}
      </div>
      <div className="sum">
        links {sum((s) => s.linksOnline)}/{sum((s) => s.linksTotal)} · dispositivos {sum((s) => s.devicesOnline)}/{sum((s) => s.devicesTotal)}
      </div>
    </Panel>
  );
}

/* ───────── 3 · problemas ───────── */
export interface ProbRow {
  key: string;
  problem: TowerProblem;
  /** Filho suprimido (linha recuada). */
  child?: { id: string; name: string; kind: "LINK" | "DISP" | "AP" };
  /** Linha "+N suprimidos": não selecionável. */
  more?: number;
}

export function buildProbRows(problems: TowerProblem[], maxChildren = 3): ProbRow[] {
  const rows: ProbRow[] = [];
  for (const p of problems) {
    rows.push({ key: p.id, problem: p });
    p.children.slice(0, maxChildren).forEach((c) => rows.push({ key: `${p.id}>${c.id}`, problem: p, child: c }));
    if (p.children.length > maxChildren) rows.push({ key: `${p.id}+`, problem: p, more: p.children.length - maxChildren });
  }
  return rows;
}

export function ProblemsPanel({ rows, count, sel, focus, onFocus, onPick, fetchedAt }: BoxProps & { rows: ProbRow[]; count: number; sel: number; onPick: (i: number) => void; fetchedAt: number | null }) {
  const hot = rows.some((r) => !r.child && !r.more && r.problem.severity === "crit" && !r.problem.acknowledged);
  return (
    <Panel id="p3" title={`³ problemas (${count})`} sub="gravidade ▼" color="crit" hot={hot} focus={focus}>
      <div className="rows" role="listbox" aria-label="Problemas" onClick={onFocus}>
        {rows.length === 0 ? (
          <div className="empty">
            <span className="ok">✔</span> nenhum problema nesta sede
          </div>
        ) : null}
        {rows.map((r, i) => {
          if (r.more) {
            return (
              <div key={r.key} className="row pb more" data-testid="problem-more">
                <span>└ +{r.more} suprimidos</span>
              </div>
            );
          }
          const p = r.problem;
          const ack = isAckd(p);
          const sev = ack ? "dim" : p.severity === "info" ? "info" : p.severity;
          const glyph = ack ? "░" : p.severity === "crit" ? GLYPH.crit : p.severity === "warn" ? GLYPH.warn : GLYPH.info;
          const cls = `row pb${r.child ? " child" : ""}${ack ? " muted" : ""}${i === sel ? " sel" : ""}`;
          if (r.child) {
            return (
              <div key={r.key} role="option" aria-selected={i === sel} data-testid="problem-row" className={cls} onClick={() => onPick(i)}>
                <span className={sev}>└</span>
                <span>
                  <span className={sev}>{glyph}</span> {r.child.name}
                </span>
                <span className="dim">{r.child.kind.toLowerCase()}</span>
                <span>suprimido</span>
                <span />
              </div>
            );
          }
          return (
            <div key={r.key} role="option" aria-selected={i === sel} data-testid="problem-row" className={cls} onClick={() => onPick(i)}>
              <span className={sev}>{glyph}</span>
              <span>{p.name}</span>
              <span className="dim">{p.kind.toLowerCase()}</span>
              <span>{ack ? `ack${p.ackBy ? ` · ${p.ackBy}` : ""}${p.ackNote ? ` · "${p.ackNote}"` : ""}` : p.what}</span>
              <Age sec={p.sinceSec} at={fetchedAt} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ───────── 4 · dispositivos ───────── */
const COLS: [SortKey, string][] = [["st", "ST"], ["name", "NOME"], ["ip", "IP"], ["type", "TIPO"], ["ping", "PING"]];

function pingCell(d: TowerDevice): ReactNode {
  if (d.state === "ok") return d.responseMs != null ? `${d.responseMs}ms` : "—";
  if (d.state === "sup") return <span className="warn">supr.</span>;
  if (d.state === "unk") return <span className="faint">não mon.</span>;
  return <span className="crit">--</span>;
}

interface DevicesProps extends BoxProps {
  devices: TowerDevice[];
  total: number;
  sel: number;
  sort: SortSpec;
  query: string;
  message: ReactNode;
  filterRef: React.RefObject<HTMLInputElement | null>;
  onQuery: (q: string) => void;
  onFilterKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSort: (k: SortKey) => void;
  onPick: (i: number) => void;
}

export function DevicesPanel({ devices, total, sel, sort, query, message, filterRef, focus, onFocus, onQuery, onFilterKey, onSort, onPick }: DevicesProps) {
  return (
    <Panel id="p4" title="⁴ dispositivos" sub={query.trim() ? `/${query.trim()}` : "todos"} right={`${devices.length}/${total}`} color="warn" focus={focus}>
      <div className="filter">
        <label htmlFor="flt">/</label>
        <input
          id="flt"
          ref={filterRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="sede:ita tipo:switch off nome-ou-ip"
          aria-label="Filtro de dispositivos"
          aria-describedby="flt-msg"
          value={query}
          onFocus={onFocus}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onFilterKey}
        />
      </div>
      <div className="filter-msg" id="flt-msg">
        {message}
      </div>
      <div className="tbl-scroll" onClick={onFocus}>
        <div className="rows" id="devrows" role="table" aria-label="Dispositivos">
          <div className="row dv thead" role="row">
            {COLS.map(([k, label]) => (
              <span key={k} role="columnheader" aria-sort={sort.key === k ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => onSort(k)}>
                  {label}
                </button>
              </span>
            ))}
          </div>
          {devices.length === 0 ? <div className="empty">nada corresponde ao filtro</div> : null}
          {devices.map((d, i) => {
            const [g, c] = ST_GLYPH[d.state];
            return (
              <div
                key={d.id}
                role="row"
                aria-current={i === sel ? "true" : undefined}
                data-testid="dev-row"
                className={`row dv${i === sel ? " sel" : ""}${d.state === "sup" || d.state === "unk" ? " muted" : ""}`}
                onClick={() => onPick(i)}
              >
                <span role="cell" className={c} aria-label={ST_LABEL[d.state]}>
                  {g}
                </span>
                <span role="cell">{d.name}</span>
                <span role="cell">{d.ip}</span>
                <span role="cell" className="dim">
                  {d.type.toLowerCase()}
                </span>
                <span role="cell">{pingCell(d)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/* ───────── detalhe ───────── */
export type DetailTab = "resumo" | "histórico";

interface DetailProps {
  snap: TowerSnapshot;
  target: Target | null;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  fetchedAt: number | null;
  canAct: boolean;
  busy: boolean;
  acked: boolean;
  silenceOpen: boolean;
  maintenance: string | null;
  onAction: (k: "p" | "w" | "c" | "a" | "s") => void;
  onSilence: (minutes: number | null) => void;
  onCloseSilence: () => void;
  silenceOptions: readonly number[];
}

export function describeTarget(snap: TowerSnapshot, t: Target | null): { title: string; ip: string | null; item: TowerLink | TowerDevice | TowerAp } | null {
  if (!t) return null;
  if (t.type === "link") {
    const l = snap.links.find((x) => x.id === t.id);
    return l ? { title: linkLabel(l), ip: snap.devices.find((d) => d.name === l.gatewayName)?.ip ?? null, item: l } : null;
  }
  if (t.type === "ap") {
    const a = snap.aps.find((x) => x.id === t.id);
    return a ? { title: a.name, ip: null, item: a } : null;
  }
  const d = snap.devices.find((x) => x.id === t.id);
  return d ? { title: d.name, ip: d.ip, item: d } : null;
}

function neighbors(snap: TowerSnapshot, d: TowerDevice): TowerDevice[] {
  return snap.devices
    .filter((x) => x.site === d.site && x.id !== d.id && x.state === "ok" && (x.type === "MIKROTIK" || /^(sw|css|crs)/i.test(x.name)))
    .slice(0, 2);
}

function DevResumo({ snap, d, fetchedAt }: { snap: TowerSnapshot; d: TowerDevice; fetchedAt: number | null }) {
  const parent = d.suppressedByLinkId ? snap.links.find((l) => l.id === d.suppressedByLinkId) : null;
  const neigh = neighbors(snap, d);
  const down = d.state === "crit" || d.state === "sup" || d.state === "ack";
  return (
    <>
      <dl className="kv">
        <dt>ip</dt>
        <dd>
          {d.ip} · {d.type.toLowerCase()} · {d.site ?? "?"}
        </dd>
        <dt>último ok</dt>
        <dd>{d.state === "ok" ? "agora" : d.offlineForSec != null ? <>há <Age sec={d.offlineForSec} at={fetchedAt} /></> : "—"}</dd>
        <dt>falhas</dt>
        <dd>
          {parent ? (
            <>
              <span className="warn">suprimido</span>: link {linkLabel(parent)} DOWN
            </>
          ) : d.consecutiveFailures > 0 ? (
            <span className="crit">{d.consecutiveFailures} seguidas</span>
          ) : (
            "0"
          )}
        </dd>
        {d.acknowledged ? (
          <>
            <dt>ack</dt>
            <dd>
              {d.ackBy ?? "—"}
              {d.ackNote ? ` · "${d.ackNote}"` : ""}
            </dd>
          </>
        ) : null}
        {neigh.length ? (
          <>
            <dt>vizinhos</dt>
            <dd>
              {neigh.map((n, i) => (
                <span key={n.id}>
                  {i ? " · " : ""}
                  {n.name} <span className="ok">●</span> {n.responseMs ?? "—"}ms
                </span>
              ))}
            </dd>
          </>
        ) : null}
      </dl>
      {d.spark.length >= 2 ? (
        <>
          <div className="sp-l">ping 24h (ms)</div>
          <Spark values={d.spark} color={down ? "var(--crit)" : "var(--ok)"} height={36} label="Ping nas últimas 24 horas" />
        </>
      ) : null}
    </>
  );
}

function LinkResumo({ l }: { l: TowerLink }) {
  return (
    <>
      <dl className="kv">
        <dt>estado</dt>
        <dd>
          {l.isOnline ? <span className={pctLevel(l.usagePct)}>{l.usagePct != null ? `${l.usagePct}% do contratado` : "online"}</span> : <span className="crit">DOWN há {fmtAge(l.downForSec)}</span>}
        </dd>
        <dt>tráfego</dt>
        <dd>
          ↓{fmtMbps(l.downBps)} ↑{fmtMbps(l.upBps)} de {fmtMbps(l.contractedDownBps)}
        </dd>
        <dt>latência</dt>
        <dd>{l.latencyMs != null ? `${l.latencyMs}ms` : "—"}</dd>
        <dt>gateway</dt>
        <dd>{l.gatewayName ? `${l.gatewayName}${l.mikrotikInterface ? ` ${l.mikrotikInterface}` : ""}` : "—"}</dd>
        <dt>24h</dt>
        <dd>
          {l.availability24h != null ? `${l.availability24h.toFixed(2)}% disponível` : "—"} · {l.drops7d} quedas em 7d
        </dd>
        {l.acknowledged ? (
          <>
            <dt>ack</dt>
            <dd>{l.ackBy ?? "—"}{l.ackNote ? ` · "${l.ackNote}"` : ""}</dd>
          </>
        ) : null}
      </dl>
      {l.spark.length >= 2 ? (
        <>
          <div className="sp-l">↓ tráfego 24h</div>
          <Spark values={l.spark} color={l.isOnline ? "var(--info)" : "var(--crit)"} height={44} label="Tráfego de download nas últimas 24 horas" />
        </>
      ) : null}
    </>
  );
}

function ApResumo({ a }: { a: TowerAp }) {
  return (
    <dl className="kv">
      <dt>controle</dt>
      <dd>{a.vendor} · {a.site ?? "?"}</dd>
      <dt>estado</dt>
      <dd>{ST_LABEL[a.state]}{a.offlineForSec != null ? ` há ${fmtAge(a.offlineForSec)}` : ""}</dd>
      <dt>clientes</dt>
      <dd>{a.clients ?? "—"}</dd>
      <dt>canal</dt>
      <dd>{a.channel ?? "—"}{a.utilPct != null ? ` · util ${a.utilPct}%` : ""}</dd>
      <dt>sinal</dt>
      <dd>{a.signalDbm != null ? `${a.signalDbm} dBm` : "—"}</dd>
    </dl>
  );
}

function History({ snap, name }: { snap: TowerSnapshot; name: string }) {
  const ev = snap.events.filter((e) => e.text.toLowerCase().includes(name.toLowerCase())).slice(0, 8);
  if (!ev.length) return <div className="empty">sem eventos recentes</div>;
  return (
    <div className="hist">
      {ev.map((e) => {
        const cls = e.severity === "crit" ? "crit" : e.severity === "warn" ? "warn" : e.severity === "ok" ? "ok" : "dim";
        const g = e.severity === "crit" ? "✖" : e.severity === "warn" ? "▲" : e.severity === "ok" ? "●" : "·";
        const t = new Date(e.at);
        const hm = Number.isNaN(t.getTime()) ? "--:--" : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
        return (
          <div key={e.id}>
            <span className="dim">{hm}</span> <span className={cls}>{g}</span> {e.text}
          </div>
        );
      })}
    </div>
  );
}

export function DetailPanel({ snap, target, tab, onTab, fetchedAt, canAct, busy, acked, silenceOpen, maintenance, onAction, onSilence, onCloseSilence, silenceOptions }: DetailProps) {
  const info = describeTarget(snap, target);
  return (
    <Panel id="pd" title="DETALHE" sub={info ? `· ${info.title}` : undefined} right={<><kbd>esc</kbd> fecha</>} color="accent">
      {!info || !target ? (
        <div className="empty">
          nenhum item selecionado · <kbd>⏎</kbd> em qualquer linha abre aqui
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Abas do detalhe">
            {(["resumo", "histórico"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)}>
                {t}
              </button>
            ))}
          </div>
          {tab === "resumo" ? (
            target.type === "link" ? (
              <LinkResumo l={info.item as TowerLink} />
            ) : target.type === "ap" ? (
              <ApResumo a={info.item as TowerAp} />
            ) : (
              <DevResumo snap={snap} d={info.item as TowerDevice} fetchedAt={fetchedAt} />
            )
          ) : (
            <History snap={snap} name={target.type === "link" ? (info.item as TowerLink).name : (info.item as TowerDevice | TowerAp).name} />
          )}
          {silenceOpen && canAct ? (
            <div className="actbar" role="group" aria-label="Silenciar">
              <span>silenciar por:</span>
              {silenceOptions.map((m, i) => (
                <button key={m} type="button" className="btn" onClick={() => onSilence(m)}>
                  <kbd>{i + 1}</kbd>
                  {m / 60}h
                </button>
              ))}
              {maintenance ? (
                <button type="button" className="btn" onClick={() => onSilence(null)}>
                  remover silêncio
                </button>
              ) : null}
              <button type="button" className="btn" onClick={onCloseSilence}>
                cancelar
              </button>
            </div>
          ) : null}
          <div className="btns" style={{ marginTop: 10 }}>
            {canAct ? (
              <button type="button" className="btn" disabled={busy} onClick={() => onAction("p")}>
                <kbd>p</kbd>ping
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => onAction("w")}>
              <kbd>w</kbd>web
            </button>
            <button type="button" className="btn" onClick={() => onAction("c")}>
              <kbd>c</kbd>copiar IP
            </button>
            {canAct ? (
              <button type="button" className="btn" disabled={busy} onClick={() => onAction("a")}>
                <kbd>a</kbd>
                {acked ? "desfazer ack" : "ack"}
              </button>
            ) : null}
            {canAct ? (
              <button type="button" className="btn" disabled={busy} onClick={() => onAction("s")}>
                <kbd>s</kbd>silenciar
              </button>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}

