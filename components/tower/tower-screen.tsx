"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FrozenBanner, HelpOverlay, KeyHints, Panel, Toast, TopBar, useToast } from "@/components/tui";
import type { SiteFilter } from "@/components/tui";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useNow } from "@/hooks/use-now";
import { useTower } from "@/hooks/use-tower";
import { SITE_KEYS } from "@/lib/modules";
import { SILENCE_OPTIONS_MIN, type TowerProblem } from "@/lib/tower-types";
import { SEVERITY_ORDER, fmtAge, fmtHM } from "@/lib/tui-format";
import { buildMockSnapshot } from "./mock-snapshot";
import {
  ackProblem, buildSummary, copyText, maintenanceOf, recheck, recheckType, silenceProblem, unackProblem, unsilenceProblem, webIp,
  type ActionResult,
} from "./tower-actions";
import { DetailPanel, EventsPanel, LinksPanel, ProblemsPanel, UnitsPanel } from "./tower-panels";

interface TowerScreenProps {
  /** Papel do usuário; VIEWER não vê ações que alteram estado. */
  role: string;
  /** Usa o snapshot de exemplo local (?mock=1), sem backend. */
  mock?: boolean;
  /** Modo TV (?tv=1): sem ações e sem rodapé. */
  tv?: boolean;
}

type Mode = null | "ack" | "silence";

const HELP: HelpRow[] = [
  ["j / k", "mover seleção (setas também)"],
  ["⏎", "abrir detalhe"],
  ["esc", "fechar detalhe, menu ou ajuda"],
  ["0 1 2 3", "todas / Barra / Botafogo / Itaguaí"],
  ["e", "expandir dependentes do problema"],
  ["f", "modo só problemas (celular, TV)"],
  ["a", "ack com nota opcional (de novo: desfaz)"],
  ["s", "silenciar 1h / 4h / 12h"],
  ["r", "rechecar agora"],
  ["c", "copiar resumo para o chamado"],
  ["w", "abrir web do equipamento"],
];

/** Interface TOWER/1: fila de exceções, links, unidades, detalhe inline e eventos sobre o snapshot de /api/tower. */
export function TowerScreen({ role, mock = false, tv = false }: TowerScreenProps) {
  const mockSnap = useMemo(() => (mock ? buildMockSnapshot() : null), [mock]);
  const { data, error, ageSec, fetchedAt, frozen, refresh } = useTower(mockSnap);
  const { msg, show } = useToast();
  const now = useNow();
  const canAct = role !== "VIEWER" && !tv;

  const [site, setSite] = useState<SiteFilter>("ALL");
  const [selId, setSelId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState("");
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const all = data?.problems ?? [];
    return all
      .filter((p) => site === "ALL" || p.site === site)
      .slice()
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.sinceSec - a.sinceSec);
  }, [data, site]);

  const selIdx = Math.max(0, list.findIndex((p) => p.id === selId));
  const sel: TowerProblem | undefined = list[selIdx];

  const openCount = (data?.problems ?? []).filter((p) => p.severity !== "ack" && !p.acknowledged).length;
  useEffect(() => {
    const prev = document.title;
    document.title = `(${openCount}) WatchIT`;
    return () => { document.title = prev; };
  }, [openCount]);

  const move = (d: number) => {
    if (!list.length) return;
    setSelId(list[Math.min(list.length - 1, Math.max(0, selIdx + d))].id);
  };

  const changeSite = (s: SiteFilter) => { setSite(s); setSelId(null); };

  const report = useCallback(
    (r: ActionResult, ok: string) => {
      show(r.ok ? ok : `Falhou: ${r.message}`);
      if (r.ok) refresh();
    },
    [show, refresh],
  );

  async function run(label: string, fn: () => Promise<ActionResult>, ok: string) {
    if (mock) { show(`${label} (simulação)`); return; }
    setBusy(true);
    try { report(await fn(), ok); } finally { setBusy(false); }
  }

  const doAck = () => {
    if (!sel || !canAct) return;
    if (sel.acknowledged || sel.severity === "ack") {
      void run(`Ack removido de ${sel.name}`, () => unackProblem(sel), `Ack removido de ${sel.name}`);
      return;
    }
    setDetailOpen(true);
    setMode("ack");
    setNote("");
  };
  const confirmAck = () => {
    if (!sel) return;
    const n = note.trim();
    setMode(null);
    void run(`Ack registrado em ${sel.name}`, () => ackProblem(sel, n || undefined), `Ack registrado em ${sel.name}`);
  };
  const doSilence = () => { if (sel && canAct) { setDetailOpen(true); setMode("silence"); } };
  const pickSilence = (minutes: number | null) => {
    if (!sel) return;
    setMode(null);
    if (minutes === null) void run(`Silêncio removido de ${sel.name}`, () => unsilenceProblem(sel), `Silêncio removido de ${sel.name}`);
    else void run(`${sel.name} silenciado por ${minutes / 60}h`, () => silenceProblem(sel, minutes), `${sel.name} silenciado por ${minutes / 60}h`);
  };
  const doRecheck = () => {
    if (!sel || !data || !canAct) return;
    show(`Rechecando ${sel.name}…`);
    void run(`Recheck de ${sel.name}`, () => recheck(recheckType(sel, data)), `Recheck de ${sel.name} concluído`);
  };
  const doCopy = async (p: TowerProblem | undefined = sel) => {
    if (!p) { show("Nenhum problema selecionado"); return; }
    const txt = buildSummary(p);
    show((await copyText(txt)) ? "Resumo copiado para o chamado" : txt);
  };
  const doWeb = () => {
    if (!sel || !data) return;
    const ip = webIp(sel, data);
    if (!ip) { show("Sem IP conhecido para abrir"); return; }
    window.open(`http://${ip}`, "_blank", "noopener,noreferrer");
  };
  const onRowAct = (id: string, act: "a" | "s" | "c") => {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    setSelId(id);
    setDetailOpen(true);
    if (act === "c") { void doCopy(p); return; }
    // Aguarda a seleção refletir antes de abrir o menu inline.
    if (act === "a") {
      if (p.acknowledged || p.severity === "ack") void run(`Ack removido de ${p.name}`, () => unackProblem(p), `Ack removido de ${p.name}`);
      else { setMode("ack"); setNote(""); }
    } else setMode("silence");
  };

  const toggleExpand = (id: string) =>
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const closeTop = () => {
    if (help) setHelp(false);
    else if (mode) setMode(null);
    else setDetailOpen(false);
  };

  const keys: HotkeyMap = { Escape: closeTop, "?": () => setHelp((h) => !h) };
  if (!help) {
    Object.assign(keys, {
      j: () => move(1), k: () => move(-1), ArrowDown: () => move(1), ArrowUp: () => move(-1),
      Enter: () => setDetailOpen(true),
      "0": () => changeSite("ALL"),
      f: () => setOnlyProblems((v) => !v),
      e: () => { if (sel?.children.length) toggleExpand(sel.id); },
      c: () => void doCopy(), w: doWeb,
      a: doAck, s: doSilence, r: doRecheck,
    });
    SITE_KEYS.forEach((k, i) => { keys[String(i + 1)] = () => changeSite(k); });
    if (mode === "silence") {
      SILENCE_OPTIONS_MIN.forEach((m, i) => { keys[String(i + 1)] = () => pickSilence(m); });
    }
  }
  useHotkeys(keys);

  // "tudo ok há X": tempo desde o último evento registrado.
  const lastEvent = data?.events.map((e) => new Date(e.at).getTime()).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0];
  const allOk = (
    <>
      <b>✔ tudo ok</b>
      {lastEvent && now ? ` há ${fmtAge((now - lastEvent) / 1000)}` : ""} · {data?.monitored.online ?? 0}/{data?.monitored.total ?? 0} monitorados
    </>
  );

  const hints: KeyHint[] = [
    { keys: ["j", "k"], label: "mover" }, { keys: ["⏎"], label: "detalhe" }, { keys: ["esc"], label: "fechar" },
    { keys: ["0", "–", "3"], label: "unidade" },
    ...(canAct ? [{ keys: ["a"], label: "ack" }, { keys: ["s"], label: "silenciar" }, { keys: ["r"], label: "rechecar" }] : []),
    { keys: ["c"], label: "copiar resumo" }, { keys: ["w"], label: "web" }, { keys: ["?"], label: "ajuda" },
  ];

  const maint = sel && data ? maintenanceOf(sel, data) : null;
  const actions = sel ? (
    <>
      {canAct && mode === "ack" ? (
        <div className="actbar" role="group" aria-label="Ack">
          <span>ack em {sel.name}:</span>
          <input
            autoFocus
            aria-label="Nota do ack"
            placeholder="nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAck(); } }}
          />
          <button type="button" className="btn" disabled={busy} onClick={confirmAck}>confirmar</button>
          <button type="button" className="btn" onClick={() => setMode(null)}>cancelar</button>
        </div>
      ) : null}
      {canAct && mode === "silence" ? (
        <div className="actbar" role="group" aria-label="Silenciar">
          <span>silenciar {sel.name} por:</span>
          {SILENCE_OPTIONS_MIN.map((m, i) => (
            <button key={m} type="button" className="btn" onClick={() => pickSilence(m)}><kbd>{i + 1}</kbd>{m / 60}h</button>
          ))}
          {maint ? <button type="button" className="btn" onClick={() => pickSilence(null)}>remover silêncio (até {fmtHM(maint)})</button> : null}
          <button type="button" className="btn" onClick={() => setMode(null)}>cancelar</button>
        </div>
      ) : null}
      {!mode ? (
        <div className="btns" style={{ marginTop: 10 }}>
          {canAct ? <button type="button" className="btn" disabled={busy} onClick={doAck}><kbd>a</kbd>{sel.acknowledged ? "desfazer ack" : "ack"}</button> : null}
          {canAct ? <button type="button" className="btn" disabled={busy} onClick={doSilence}><kbd>s</kbd>silenciar</button> : null}
          {canAct ? <button type="button" className="btn" disabled={busy} onClick={doRecheck}><kbd>r</kbd>rechecar</button> : null}
          <button type="button" className="btn" onClick={() => void doCopy()}><kbd>c</kbd>copiar resumo</button>
          <button type="button" className="btn" onClick={doWeb}><kbd>w</kbd>abrir web</button>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <div className={`tui${tv ? " tv" : ""}`}>
      <TopBar health={data?.health ?? null} ageSec={ageSec} frozen={frozen} site={site} onSite={changeSite} alerts={openCount} />
      <FrozenBanner frozen={frozen} ageSec={ageSec} workerStale={data?.health.workerStatus === "stale"} error={error} />

      {!data ? (
        <div className="grid">
          <Panel title="PROBLEMAS" color="dim" full>
            <div className="dim">{error ? "Sem dados: não foi possível carregar o snapshot." : "carregando…"}</div>
          </Panel>
        </div>
      ) : (
        <main className={`grid g-tower${onlyProblems ? " only-problems" : ""}`}>
          <ProblemsPanel
            list={list}
            selId={sel?.id ?? null}
            expanded={expanded}
            fetchedAt={fetchedAt}
            canAct={canAct}
            onlyProblems={onlyProblems}
            allOk={allOk}
            onSelect={(id) => { setSelId(id); setDetailOpen(true); }}
            onToggleExpand={toggleExpand}
            onAct={onRowAct}
            onToggleOnly={() => setOnlyProblems((v) => !v)}
          />
          <LinksPanel
            links={data.links.filter((l) => site === "ALL" || l.site === site)}
            fetchedAt={fetchedAt}
            onPick={(l) => {
              const p = list.find((x) => x.kind === "LINK" && x.entityId === l.id);
              if (p) { setSelId(p.id); setDetailOpen(true); } else show("Link sem problemas abertos");
            }}
          />
          <UnitsPanel sites={data.sites} site={site} onSite={changeSite} />
          {detailOpen && sel && !onlyProblems ? <DetailPanel problem={sel} snap={data} fetchedAt={fetchedAt} actions={actions} /> : null}
          <EventsPanel events={data.events.filter((e) => site === "ALL" || e.site === site)} />
        </main>
      )}

      {!tv ? <KeyHints hints={hints} /> : null}
      <Toast msg={msg} />
      {help ? <HelpOverlay rows={HELP} onClose={() => setHelp(false)} /> : null}
    </div>
  );
}
