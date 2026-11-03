"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, FrozenBanner, Spark, HelpOverlay, KeyHints, Panel, Toast, useToast } from "@/components/tui";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useNow } from "@/hooks/use-now";
import { useTower } from "@/hooks/use-tower";
import { SITE_KEYS, SITE_NAMES } from "@/lib/modules";
import { monthKeyOf } from "@/lib/sla";
import type { TowerLink, TowerProblem } from "@/lib/tower-types";
import { GLYPH, SEVERITY_ORDER, fmtAge, fmtClock, fmtHM, fmtMbps } from "@/lib/tui-format";
import { ackProblem, copyText, recheck, recheckType, silenceProblem, unackProblem, type ActionResult } from "@/components/tower/tower-actions";
import { buildMockReport, buildNettopMockSnapshot } from "./mock-extra";
import { buildTopology, routerosCommand, sortAps, wanRoles, apRank } from "./nettop-logic";
import { NETTOP_CSS } from "./nettop-styles";
import { SlaStrip, useSla } from "./sla-strip";

type Tab = "rede" | "wifi" | "hosts" | "log";
const TABS: [string, Tab, string][] = [["1", "rede", "Rede"], ["2", "wifi", "Wi-Fi"], ["3", "hosts", "Hosts"], ["4", "log", "Log"]];

interface NetTopScreenProps {
  role: string;
  /** Snapshot de exemplo local (?mock=1). */
  mock?: boolean;
  /** Modo TV (?tv=1): sem ações e sem rodapé. */
  tv?: boolean;
}

const HELP: HelpRow[] = [
  ["1 2 3 4", "abas Rede / Wi-Fi / Hosts / Log"],
  ["← →", "trocar o link selecionado (j / k também)"],
  ["⏎", "mostrar/ocultar detalhe do link"],
  ["t", "painel ⁴: APs ⇄ topologia em texto"],
  ["m", "SLA: mês atual ⇄ anterior"],
  ["/", "buscar host"],
  ["a", "ack do problema do link (de novo: desfaz)"],
  ["s", "silenciar o link por 1h"],
  ["r", "rechecar agora"],
  ["y", "copiar comando RouterOS de diagnóstico"],
  ["esc", "fechar detalhe ou ajuda"],
];

function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const linkLabel = (l: TowerLink) => `${l.site ?? "?"} ${l.name}`;

/** Interface NetTop (rede primeiro) sobre o snapshot de /api/tower: WAN/failover, unidades, tráfego, APs, eventos e SLA mensal. */
export function NetTopScreen({ role, mock = false, tv = false }: NetTopScreenProps) {
  const mockSnap = useMemo(() => (mock ? buildNettopMockSnapshot() : null), [mock]);
  const { data, error, ageSec, frozen, refresh } = useTower(mockSnap);
  const { msg, show } = useToast();
  const now = useNow();
  const canAct = role !== "VIEWER" && !tv;

  const [tab, setTab] = useState<Tab>("rede");
  const [linkIdx, setLinkIdx] = useState(0);
  const [detail, setDetail] = useState(false);
  const [topo, setTopo] = useState(false);
  const [allAps, setAllAps] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);

  const curMonth = useMemo(() => monthKeyOf(new Date()), []);
  const [prev, setPrev] = useState(false);
  const month = prev ? prevMonth(curMonth) : curMonth;
  const loader = useMemo(() => (mock && mockSnap ? (m: string) => buildMockReport(mockSnap, new Date(), m) : undefined), [mock, mockSnap]);
  const sla = useSla(month, loader);

  const links = data?.links ?? [];
  const roles = useMemo(() => wanRoles(links), [links]);
  const sel: TowerLink | undefined = links[Math.min(linkIdx, Math.max(0, links.length - 1))];
  const openCount = (data?.problems ?? []).filter((p) => p.severity !== "ack" && !p.acknowledged).length;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = `(${openCount}) WatchIT`;
    return () => { document.title = prevTitle; };
  }, [openCount]);

  const moveLink = (d: number) => { if (links.length) setLinkIdx((i) => (i + d + links.length) % links.length); };

  const problemOf = (l: TowerLink | undefined): TowerProblem | undefined => data?.problems.find((p) => p.kind === "LINK" && p.entityId === l?.id);

  async function run(label: string, fn: () => Promise<ActionResult>) {
    if (mock) { show(`${label} (simulação)`); return; }
    setBusy(true);
    try {
      const r = await fn();
      show(r.ok ? label : `Falhou: ${r.message}`);
      if (r.ok) refresh();
    } finally { setBusy(false); }
  }
  const withProblem = (fn: (p: TowerProblem) => void) => {
    if (!canAct || !sel) return;
    const p = problemOf(sel);
    if (!p) { show(`${linkLabel(sel)} não tem problema aberto`); return; }
    fn(p);
  };
  const doAck = () => withProblem((p) => {
    if (p.acknowledged || p.severity === "ack") void run(`Ack removido de ${p.name}`, () => unackProblem(p));
    else void run(`Ack registrado em ${p.name}`, () => ackProblem(p));
  });
  const doSilence = () => withProblem((p) => void run(`${p.name} silenciado por 1h`, () => silenceProblem(p, 60)));
  const doRecheck = () => withProblem((p) => {
    show(`Rechecando ${p.name}…`);
    if (data) void run(`Recheck de ${p.name} concluído`, () => recheck(recheckType(p, data)));
  });
  const doCopy = async () => {
    if (!sel) { show("Nenhum link selecionado"); return; }
    const cmd = routerosCommand(sel);
    show((await copyText(cmd)) ? "Comando RouterOS copiado" : cmd);
  };

  const keys: HotkeyMap = { Escape: () => (help ? setHelp(false) : setDetail(false)), "?": () => setHelp((h) => !h) };
  if (!help) {
    TABS.forEach(([k, t]) => { keys[k] = () => setTab(t); });
    Object.assign(keys, {
      ArrowRight: () => moveLink(1), ArrowLeft: () => moveLink(-1), j: () => moveLink(1), k: () => moveLink(-1),
      Enter: () => setDetail((d) => !d),
      t: () => { setTab("rede"); setTopo((v) => !v); },
      m: () => setPrev((v) => !v),
      "/": () => { setTab("hosts"); setTimeout(() => document.getElementById("nt-hq")?.focus(), 0); },
      a: doAck, s: doSilence, r: doRecheck, y: () => void doCopy(),
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["1", "–", "4"], label: "aba" }, { keys: ["←", "→"], label: "link" }, { keys: ["⏎"], label: "detalhe" },
    ...(canAct ? [{ keys: ["a"], label: "ack" }, { keys: ["r"], label: "rechecar" }, { keys: ["s"], label: "silenciar" }] : []),
    { keys: ["y"], label: "copiar cmd RouterOS" }, { keys: ["t"], label: "topologia" }, { keys: ["/"], label: "buscar host", hideSm: true }, { keys: ["?"], label: "ajuda" },
  ];

  // ── painéis ──
  const wanPanel = (
    <Panel title="¹ WAN / failover" sub="◉ rota ativa (derivada) · ○ standby" color="info" id="nt-wan">
      <div>
        {SITE_KEYS.map((s) => {
          const ls = links.filter((l) => l.site === s);
          if (!ls.length) return null;
          const bad = ls.some((l) => !l.isOnline);
          const active = ls.find((l) => roles.get(l.id) === "active");
          return (
            <div className={`wan-site${bad ? " bad" : ""}`} key={s} data-testid={`wan-${s}`}>
              <div className="rows">
                {ls.map((l, i) => {
                  const role_ = roles.get(l.id);
                  const idx = links.indexOf(l);
                  return (
                    <div
                      key={l.id}
                      className={`row wan${idx === linkIdx ? " sel" : ""}`}
                      data-testid="wan-row"
                      aria-selected={idx === linkIdx}
                      onClick={() => { setLinkIdx(idx); setDetail(true); }}
                    >
                      <span className="sname">{i === 0 ? SITE_NAMES[s].toUpperCase() : ""}</span>
                      <span className={role_ === "down" ? "crit" : role_ === "active" ? "info" : "dim"} aria-label={role_ === "down" ? "fora" : role_ === "active" ? "ativo" : "standby"}>
                        {role_ === "down" ? "✖" : role_ === "active" ? "◉" : "○"}
                      </span>
                      <span>{l.name}</span>
                      {role_ === "down" ? (
                        <span className="crit">DOWN {fmtAge((l.downForSec ?? 0) + ageSec)}</span>
                      ) : role_ === "standby" ? (
                        <span className="dim">standby · {l.latencyMs != null ? `${l.latencyMs}ms` : "—"}</span>
                      ) : (
                        <Bar pct={l.usagePct} width="100%" label={`uso de ${l.name}`} />
                      )}
                      <span className="dim">{role_ === "active" ? `↓${fmtMbps(l.downBps)}` : ""}</span>
                    </div>
                  );
                })}
              </div>
              <div className="wan-note">
                {bad && active ? <span className="warn">⇄ rota via {active.name} (derivado: link de maior tráfego)</span>
                  : bad ? <span className="crit">sem link online na unidade</span>
                  : <span>{ls.length} {ls.length === 1 ? "link" : "links"} · {ls.filter((l) => l.availability24h != null).length ? `disp. 24h ${ls.map((l) => (l.availability24h == null ? "—" : `${l.availability24h}%`)).join(" / ")}` : "sem dado de disponibilidade"}</span>}
              </div>
            </div>
          );
        })}
        {!links.length ? <div className="empty">Nenhum link cadastrado.</div> : null}
      </div>
    </Panel>
  );

  const unitsPanel = (
    <Panel title="² unidades" color="accent2" id="nt-units">
      <div className="rows">
        <div className="row unit2 muted"><span>un.</span><span>gateway</span><span>disp.</span><span>AP</span><span>clientes</span></div>
        {(data?.sites ?? []).filter((s) => s.site).map((s) => {
          const gw = data?.devices.find((d) => d.site === s.site && d.type === "MIKROTIK");
          return (
            <div className="row unit2" key={s.site}>
              <span>{s.site}</span>
              <span>{gw ? <><span className={gw.state === "ok" ? "ok" : gw.state === "crit" ? "crit" : "dim"}>{GLYPH[gw.state]}</span> {gw.name}</> : <span className="dim">—</span>}</span>
              <span className={s.devicesOffline ? "warn" : ""}>{s.devicesOnline}/{s.devicesTotal}</span>
              <span className={s.apsOnline === s.apsTotal ? "" : "warn"}>{s.apsOnline}/{s.apsTotal}</span>
              <span>{s.clients ?? "—"}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );

  const trafficPanel = (
    <Panel title="³ tráfego" sub={sel ? `· ${linkLabel(sel)}${sel.mikrotikInterface ? ` (${sel.mikrotikInterface})` : ""}` : ""} right={<><kbd>←</kbd><kbd>→</kbd> link</>} color="info" full id="nt-traffic">
      {sel ? (
        <div data-testid="traffic">
          <div className="traffic-head">
            <span className="linkname">{linkLabel(sel)}</span>
            <span>↓ <b>{sel.isOnline ? fmtMbps(sel.downBps) : <span className="crit">0M · DOWN</span>}</b></span>
            <span>↑ {sel.isOnline ? fmtMbps(sel.upBps) : "0M"}</span>
            <span className="warn">┄ contratado ↓{fmtMbps(sel.contractedDownBps)} ↑{fmtMbps(sel.contractedUpBps)}</span>
            <span>latência {sel.latencyMs != null ? `${sel.latencyMs}ms` : "—"}</span>
          </div>
          {sel.spark.length >= 2 ? <Spark values={sel.spark.map((v) => v / 1e6)} label="download 24h (Mbps)" height={60} /> : <div className="empty" data-testid="traffic-empty">sem histórico de tráfego ainda</div>}
          <div className="tstats">
            <span>uso {sel.usagePct != null ? `${sel.usagePct}%` : "—"}</span>
            <span>disp. 24h {sel.availability24h != null ? `${sel.availability24h}%` : "—"}</span>
            <span>quedas 7d {sel.drops7d}</span>
            <span className="dim">medido no {sel.gatewayName ?? "gateway desconhecido"}</span>
          </div>
          {detail ? (
            <div className="tstats" data-testid="link-detail">
              {sel.description ? <span>{sel.description}</span> : null}
              {sel.lastDownAt ? <span>última queda {fmtHM(sel.lastDownAt)}</span> : null}
              {sel.acknowledged ? <span className="dim">ack de {sel.ackBy ?? "?"}{sel.ackNote ? `: "${sel.ackNote}"` : ""}</span> : null}
              {sel.maintenanceUntil ? <span className="dim">silenciado até {fmtHM(sel.maintenanceUntil)}</span> : null}
              <span className="dim">comando: <code>{routerosCommand(sel)}</code></span>
              {canAct ? (
                <span className="btns">
                  <button type="button" className="btn" disabled={busy} onClick={doAck}><kbd>a</kbd>ack</button>{" "}
                  <button type="button" className="btn" disabled={busy} onClick={doSilence}><kbd>s</kbd>silenciar</button>{" "}
                  <button type="button" className="btn" disabled={busy} onClick={doRecheck}><kbd>r</kbd>rechecar</button>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : <div className="empty">Nenhum link para exibir.</div>}
    </Panel>
  );

  const apsSorted = sortAps(data?.aps ?? []);
  const worst = apsSorted.filter((a) => apRank(a) < 2);
  const okAps = apsSorted.filter((a) => apRank(a) === 2);
  const shownAps = allAps ? apsSorted : worst.concat(okAps.slice(0, 2));
  const apRow = (a: (typeof apsSorted)[number]) => (
    <div className="row ap" key={a.id} data-testid="ap-row">
      <span className={a.state === "crit" ? "crit" : (a.utilPct ?? 0) > 80 ? "warn" : ""}>{a.state === "crit" ? "✖ " : (a.utilPct ?? 0) > 80 ? "▲ " : ""}{a.name}</span>
      <span>{a.site ?? "?"}</span>
      <span>{a.clients ?? "—"}</span>
      <span>{a.channel ?? "—"}</span>
      <span>{a.state === "crit" ? <span className="crit">offline {fmtAge(a.offlineForSec)}</span> : a.utilPct == null ? <span className="dim">—</span> : <Bar pct={a.utilPct} width="100%" label={`util de ${a.name}`} />}</span>
      <span className="dim">{a.signalDbm == null ? "—" : `${a.signalDbm}dBm`}</span>
    </div>
  );
  const topoLines = useMemo(() => (data ? buildTopology(data) : []), [data]);
  const apsPanel = (
    <Panel title={topo ? "⁴ topologia" : "⁴ APs"} sub={topo ? "gateway → equipamentos → APs (derivado)" : "pior primeiro"} right={<><kbd>t</kbd> topologia</>} color="warn" id="nt-aps">
      {topo ? (
        <div className="tbl-scroll"><pre className="tree" data-testid="topology">{topoLines.length ? topoLines.map((l, i) => <span key={i} className={l.cls}>{l.text + "\n"}</span>) : "sem equipamentos"}</pre></div>
      ) : !apsSorted.length ? <div className="empty">Nenhum AP monitorado.</div> : (
        <div className="tbl-scroll"><div className="rows">
          <div className="row ap muted"><span>AP</span><span>un.</span><span>cli</span><span>canal</span><span>util</span><span>sinal</span></div>
          {shownAps.map(apRow)}
          {okAps.length > 2 ? (
            <div className="row child"><button type="button" className="link-btn" onClick={() => setAllAps((v) => !v)}>
              {allAps ? "▴ mostrar só os piores" : `… ${okAps.length - 2} APs ok (mostrar)`}
            </button></div>
          ) : null}
        </div></div>
      )}
    </Panel>
  );

  const events = data?.events ?? [];
  const evClass = (s: string) => (s === "info" ? "info" : s);
  const eventsPanel = (
    <Panel title="⁵ eventos" color="dim" id="nt-events">
      <div className="rows">
        {events.length ? events.slice(0, 8).map((e) => (
          <div className="row evrow" key={e.id}>
            <span className="dim">{fmtHM(e.at)}</span>
            <span className={evClass(e.severity)}>{e.severity === "info" ? "⇄" : GLYPH[e.severity === "ok" ? "ok" : e.severity]}</span>
            <span>{e.text}</span>
          </div>
        )) : <div className="empty">Nenhum evento recente.</div>}
      </div>
    </Panel>
  );

  const slaPanel = (title: string) => (
    <Panel title="SLA" sub={`· ${month}${prev ? " (anterior)" : ""}`} right={<button type="button" className="chip" onClick={() => setPrev((v) => !v)}><kbd>m</kbd> {prev ? "mês atual" : "mês anterior"}</button>} color="accent" full id={`nt-sla-${title}`}>
      <SlaStrip state={sla} />
    </Panel>
  );

  const wifiPanel = (
    <Panel title="Wi-Fi" sub="UniFi + Omada numa tabela só · pior primeiro" color="warn" id="nt-wifi">
      {!apsSorted.length ? <div className="empty">Nenhum AP monitorado.</div> : (
        <div className="tbl-scroll"><div className="rows">
          <div className="row wifi muted"><span>AP</span><span>contr.</span><span>un.</span><span>cli</span><span>canal</span><span>util</span><span>sinal</span><span>estado</span></div>
          {apsSorted.map((a) => (
            <div className="row wifi" key={a.id} data-testid="wifi-row">
              <span className={a.state === "crit" ? "crit" : (a.utilPct ?? 0) > 80 ? "warn" : ""}>{a.name}</span>
              <span className="dim">{a.vendor === "unifi" ? "UniFi" : "Omada"}</span>
              <span>{a.site ?? "?"}</span>
              <span>{a.clients ?? "—"}</span>
              <span>{a.channel ?? "—"}</span>
              <span>{a.state === "crit" ? <span className="crit">offline {fmtAge(a.offlineForSec)}</span> : a.utilPct == null ? <span className="dim">—</span> : <Bar pct={a.utilPct} width="100%" label={`util de ${a.name}`} />}</span>
              <span className="dim">{a.signalDbm == null ? "—" : `${a.signalDbm}dBm`}</span>
              <span className={a.state === "ok" ? "ok" : a.state === "crit" ? "crit" : "dim"}>{GLYPH[a.state]}</span>
            </div>
          ))}
        </div></div>
      )}
    </Panel>
  );

  const ql = q.trim().toLowerCase();
  const hosts = (data?.devices ?? []).filter((d) =>
    (!onlyBad || d.state === "crit" || d.state === "sup") &&
    (!ql || `${d.name} ${d.ip} ${d.type} ${d.site ?? ""}`.toLowerCase().includes(ql)));
  const hostsPanel = (
    <Panel title="hosts" sub="dispositivos de rede (PCs e celulares: módulos pausados)" color="accent2" id="nt-hosts">
      <div className="hosts-filter">
        <label htmlFor="nt-hq" className="dim">/ filtro</label>
        <input id="nt-hq" type="search" placeholder="nome, IP, tipo…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="chips">
          <button type="button" className="chip" aria-pressed={!onlyBad} onClick={() => setOnlyBad(false)}>todos</button>
          <button type="button" className="chip" aria-pressed={onlyBad} onClick={() => setOnlyBad(true)}>com problema</button>
        </span>
      </div>
      <div className="tbl-scroll"><div className="rows">
        {hosts.length ? hosts.map((d) => (
          <div className="row host" key={d.id} data-testid="host-row">
            <span className={d.state === "ok" ? "ok" : d.state === "crit" ? "crit" : "dim"}>{GLYPH[d.state]}</span>
            <span className="dim">DISP</span>
            <span>{d.site ?? "?"}</span>
            <span>{d.name}</span>
            <span className="dim">{d.ip}</span>
            <span className="dim">{d.type}</span>
          </div>
        )) : <div className="empty">{ql ? `Nada encontrado para "${q}".` : "Nenhum dispositivo."}</div>}
      </div></div>
    </Panel>
  );

  const logPanel = (
    <Panel title="log" sub="eventos recentes" color="dim" id="nt-log">
      <div className="rows">
        {events.length ? events.map((e) => (
          <div className="row logrow" key={e.id}>
            <span className="dim">{fmtHM(e.at)}</span>
            <span className={evClass(e.severity)}>{e.severity === "info" ? "⇄" : GLYPH[e.severity === "ok" ? "ok" : e.severity]}</span>
            <span>{e.text}</span>
          </div>
        )) : <div className="empty">Nenhum evento recente.</div>}
      </div>
    </Panel>
  );

  return (
    <div className={`tui nt${tv ? " tv" : ""}`}>
      <style>{NETTOP_CSS}</style>
      <header className="topbar">
        <span className="brand">WatchIT</span>
        <span className="clock">{now ? fmtClock(new Date(now)) : "--"}</span>
        <span>
          worker <span className={data?.health.workerStatus === "ok" ? "ok" : data?.health.workerStatus === "stale" ? "crit" : "dim"}>
            {data?.health.workerStatus === "stale" ? "✖" : data?.health.workerStatus === "ok" ? "●" : "◌"}
          </span> {data?.health.workerAgeSec != null ? fmtAge(data.health.workerAgeSec + ageSec) : "—"}
        </span>
        <span className="alertcount" aria-live="polite">{openCount > 0 ? `⚠ ${openCount} ${openCount === 1 ? "aberto" : "abertos"}` : ""}</span>
        <span className="spacer" />
        <span className="chips tabs" role="group" aria-label="Abas">
          {TABS.map(([k, t, label]) => (
            <button key={t} type="button" className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}><kbd>{k}</kbd> {label}</button>
          ))}
        </span>
      </header>
      <FrozenBanner frozen={frozen} ageSec={ageSec} workerStale={data?.health.workerStatus === "stale"} error={error} />

      {!data ? (
        <div className="grid"><Panel title="NETTOP" color="dim" full><div className="dim">{error ? "Sem dados: não foi possível carregar o snapshot." : "carregando…"}</div></Panel></div>
      ) : tab === "rede" ? (
        <main className="grid g-net" data-testid="tab-rede">{wanPanel}{unitsPanel}{trafficPanel}{apsPanel}{eventsPanel}{slaPanel("rede")}</main>
      ) : tab === "wifi" ? (
        <main className="grid" data-testid="tab-wifi">{wifiPanel}</main>
      ) : tab === "hosts" ? (
        <main className="grid" data-testid="tab-hosts">{hostsPanel}</main>
      ) : (
        <main className="grid" data-testid="tab-log">{logPanel}{slaPanel("log")}</main>
      )}

      {!tv ? <KeyHints hints={hints} /> : null}
      <Toast msg={msg} />
      {help ? <HelpOverlay rows={HELP} onClose={() => setHelp(false)} /> : null}
    </div>
  );
}
