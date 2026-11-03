"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FrozenBanner, HelpOverlay, KeyHints, Panel, Toast, TopBar, useToast } from "@/components/tui";
import type { SiteFilter } from "@/components/tui";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { buildMockSnapshot } from "@/components/tower/mock-snapshot";
import {
  ackProblem, buildSummary, copyText, recheck, recheckType, silenceProblem, unackProblem, webIp, type ActionResult,
} from "@/components/tower/tower-actions";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useTower } from "@/hooks/use-tower";
import { SITE_KEYS, type SiteKey } from "@/lib/modules";
import type { TowerProblem } from "@/lib/tower-types";
import { orderProblems, searchSnapshot, unitStatus, type SearchResult } from "./plantao-logic";
import { PLANTAO_CSS, PlantaoDetail, PlantaoEvents, QueuePanel, SearchPanel, UnitPanel, UnitTabs } from "./plantao-panels";

interface PlantaoScreenProps {
  /** Papel do usuário; VIEWER não vê ações que alteram estado. */
  role: string;
  /** Usa o snapshot de exemplo local (?mock=1), sem backend. */
  mock?: boolean;
  /** Modo TV (?tv=1): sem ações e sem rodapé. */
  tv?: boolean;
}

const MAINT_MIN = 60;

const HELP: HelpRow[] = [
  ["/", "buscar dispositivo, AP, link, IP ou unidade"],
  ["1 2 3", "destacar Barra / Botafogo / Itaguaí (no celular, trocam a aba)"],
  ["0", "todas as unidades"],
  ["j / k", "mover seleção (setas também)"],
  ["⏎", "abrir detalhe"],
  ["esc", "fechar detalhe, ajuda ou sair da busca"],
  ["a", "ack com nota opcional (de novo: desfaz)"],
  ["m", "manutenção 1h"],
  ["r", "rechecar agora"],
  ["c", "copiar resumo para o chamado"],
  ["w", "abrir web do equipamento"],
];

/** Interface Plantão: uma coluna por unidade, busca universal e fila única por causa provável, sobre o snapshot de /api/tower. */
export function PlantaoScreen({ role, mock = false, tv = false }: PlantaoScreenProps) {
  const mockSnap = useMemo(() => (mock ? buildMockSnapshot() : null), [mock]);
  const { data, error, ageSec, fetchedAt, frozen, refresh } = useTower(mockSnap);
  const { msg, show } = useToast();
  const canAct = role !== "VIEWER" && !tv;

  const [site, setSite] = useState<SiteFilter>("ALL");
  const [mobileSite, setMobileSite] = useState<SiteKey>("BAR");
  const [selId, setSelId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const [ackMode, setAckMode] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => (data ? orderProblems(data.problems, data, site) : []), [data, site]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const selIdx = Math.max(0, flat.findIndex((p) => p.id === selId));
  const sel: TowerProblem | undefined = flat[selIdx];
  const results = useMemo(() => (data ? searchSnapshot(data, query) : []), [data, query]);

  const openCount = (data?.problems ?? []).filter((p) => p.severity !== "ack" && !p.acknowledged).length;
  useEffect(() => {
    const prev = document.title;
    document.title = `(${openCount}) WatchIT`;
    return () => { document.title = prev; };
  }, [openCount]);

  const move = (d: number) => {
    if (!flat.length) return;
    setSelId(flat[Math.min(flat.length - 1, Math.max(0, selIdx + d))].id);
  };
  const pickSite = (s: SiteFilter) => {
    setSite(s);
    if (s !== "ALL") setMobileSite(s);
    setSelId(null);
    setDetailOpen(true);
  };
  const toggleSite = (s: SiteKey) => pickSite(site === s ? "ALL" : s);

  const report = useCallback((r: ActionResult, ok: string) => {
    show(r.ok ? ok : `Falhou: ${r.message}`);
    if (r.ok) refresh();
  }, [show, refresh]);

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
    setAckMode(true);
    setNote("");
  };
  const confirmAck = () => {
    if (!sel) return;
    const n = note.trim();
    setAckMode(false);
    void run(`Ack registrado em ${sel.name}`, () => ackProblem(sel, n || undefined), `Ack registrado em ${sel.name}`);
  };
  const doMaint = () => {
    if (!sel || !canAct) return;
    void run(`${sel.name} em manutenção por 1h`, () => silenceProblem(sel, MAINT_MIN), `${sel.name} em manutenção por 1h`);
  };
  const doRecheck = () => {
    if (!sel || !data || !canAct) return;
    show(`Rechecando ${sel.name}…`);
    void run(`Recheck de ${sel.name}`, () => recheck(recheckType(sel, data)), `Recheck de ${sel.name} concluído`);
  };
  const doCopy = async () => {
    if (!sel) { show("Nenhum problema selecionado"); return; }
    const txt = buildSummary(sel);
    show((await copyText(txt)) ? "Resumo copiado para o chamado" : txt);
  };
  const doWeb = () => {
    if (!sel || !data) return;
    const ip = webIp(sel, data);
    if (!ip) { show("Sem IP conhecido para abrir"); return; }
    window.open(`http://${ip}`, "_blank", "noopener,noreferrer");
  };

  const selectProblem = (kind: SearchResult["kind"], entityId: string) => {
    const p = data?.problems.find((x) => x.kind === kind && x.entityId === entityId);
    if (!p) { show("Sem problemas abertos para este item"); return; }
    if (site !== "ALL" && p.site !== site) setSite(p.site ?? "ALL");
    setSelId(p.id);
    setDetailOpen(true);
  };

  const closeTop = () => {
    if (document.activeElement === searchRef.current) searchRef.current?.blur();
    else if (help) setHelp(false);
    else if (ackMode) setAckMode(false);
    else setDetailOpen(false);
  };

  const keys: HotkeyMap = { Escape: closeTop, "?": () => setHelp((h) => !h) };
  if (!help) {
    Object.assign(keys, {
      "/": () => { searchRef.current?.focus(); searchRef.current?.select(); },
      j: () => move(1), k: () => move(-1), ArrowDown: () => move(1), ArrowUp: () => move(-1),
      Enter: () => setDetailOpen(true),
      "0": () => pickSite("ALL"),
      c: () => void doCopy(), w: doWeb, a: doAck, m: doMaint, r: doRecheck,
    });
    SITE_KEYS.forEach((k, i) => { keys[String(i + 1)] = () => toggleSite(k); });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["/"], label: "buscar" }, { keys: ["1", "2", "3"], label: "unidade" }, { keys: ["0"], label: "todas" },
    { keys: ["j", "k"], label: "mover" }, { keys: ["⏎"], label: "detalhe" }, { keys: ["esc"], label: "fechar" },
    ...(canAct ? [{ keys: ["a"], label: "ack" }, { keys: ["m"], label: "manutenção 1h" }, { keys: ["r"], label: "rechecar" }] : []),
    { keys: ["c"], label: "copiar" }, { keys: ["w"], label: "web" }, { keys: ["?"], label: "ajuda" },
  ];

  const actions = sel ? (
    ackMode && canAct ? (
      <div className="actbar" role="group" aria-label="Ack">
        <span>ack em {sel.name}:</span>
        <input
          autoFocus aria-label="Nota do ack" placeholder="nota (opcional)" value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAck(); } }}
        />
        <button type="button" className="btn" disabled={busy} onClick={confirmAck}>confirmar</button>
        <button type="button" className="btn" onClick={() => setAckMode(false)}>cancelar</button>
      </div>
    ) : (
      <div className="btns" style={{ marginTop: 10 }}>
        {canAct ? <button type="button" className="btn" disabled={busy} onClick={doAck}><kbd>a</kbd>{sel.acknowledged ? "desfazer ack" : "ack"}</button> : null}
        {canAct ? <button type="button" className="btn" disabled={busy} onClick={doMaint}><kbd>m</kbd>manutenção 1h</button> : null}
        {canAct ? <button type="button" className="btn" disabled={busy} onClick={doRecheck}><kbd>r</kbd>rechecar</button> : null}
        <button type="button" className="btn" onClick={() => void doCopy()}><kbd>c</kbd>copiar resumo</button>
        <button type="button" className="btn" onClick={doWeb}><kbd>w</kbd>abrir web</button>
      </div>
    )
  ) : null;

  const unitSummaries = (data?.sites ?? []).filter((s) => s.site !== null || s.devicesTotal + s.linksTotal + s.apsTotal > 0);
  const tabItems = data
    ? SITE_KEYS.map((k) => { const st = unitStatus(data.problems, k); return { site: k, status: st.text, level: st.level }; })
    : [];

  return (
    <div className={`tui${tv ? " tv" : ""}`}>
      <style>{PLANTAO_CSS}</style>
      <TopBar health={data?.health ?? null} ageSec={ageSec} frozen={frozen} site={site} onSite={pickSite} alerts={openCount} />
      <FrozenBanner frozen={frozen} ageSec={ageSec} workerStale={data?.health.workerStatus === "stale"} error={error} />

      {!data ? (
        <div className="grid">
          <Panel title="PLANTÃO" color="dim" full>
            <div className="dim">{error ? "Sem dados: não foi possível carregar o snapshot." : "carregando…"}</div>
          </Panel>
        </div>
      ) : (
        <main className="grid g-plantao">
          <SearchPanel
            inputRef={searchRef} value={query} onChange={setQuery} results={results}
            onPick={(r) => selectProblem(r.kind, r.entityId)}
          />
          <UnitTabs items={tabItems} active={mobileSite} onPick={(s) => pickSite(s)} />
          {unitSummaries.map((s) => {
            const idx = s.site ? SITE_KEYS.indexOf(s.site) + 1 : 0;
            return (
              <UnitPanel
                key={s.site ?? "none"}
                index={idx}
                summary={s}
                snap={data}
                focus={s.site !== null && site === s.site}
                hidden={s.site !== null && mobileSite !== s.site}
                fetchedAt={fetchedAt}
                onToggle={() => { if (s.site) toggleSite(s.site); }}
                onPickLink={(id) => selectProblem("LINK", id)}
              />
            );
          })}
          <div className="full" style={{ display: "contents" }}>
            <QueuePanel groups={groups} selId={sel?.id ?? null} fetchedAt={fetchedAt} site={site} onSelect={(id) => { setSelId(id); setDetailOpen(true); }} />
          </div>
          {detailOpen && sel ? <PlantaoDetail problem={sel} snap={data} fetchedAt={fetchedAt} actions={actions} /> : null}
          <PlantaoEvents events={data.events.filter((e) => site === "ALL" || e.site === site)} />
        </main>
      )}

      {!tv ? <KeyHints hints={hints} /> : null}
      <Toast msg={msg} />
      {help ? <HelpOverlay rows={HELP} onClose={() => setHelp(false)} /> : null}
    </div>
  );
}
