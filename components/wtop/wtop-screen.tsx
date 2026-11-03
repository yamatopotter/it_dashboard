"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FrozenBanner, HelpOverlay, KeyHints, Panel, Toast, TopBar, useToast } from "@/components/tui";
import type { SiteFilter } from "@/components/tui";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { buildMockSnapshot } from "@/components/tower/mock-snapshot";
import { copyText, recheck, recheckType, silenceProblem, unsilenceProblem, ackProblem, unackProblem, webIp } from "@/components/tower/tower-actions";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useTower } from "@/hooks/use-tower";
import { SITE_KEYS, SITE_NAMES } from "@/lib/modules";
import { SILENCE_OPTIONS_MIN, type TowerProblem, type TowerSnapshot } from "@/lib/tower-types";
import { SEVERITY_ORDER, fmtMbps } from "@/lib/tui-format";
import { matchesFilter, parseFilter, sortDevices, type SortKey, type SortSpec } from "@/lib/wtop-filter";
import { CommandPalette, type PaletteItem } from "./command-palette";
import {
  DetailPanel, DevicesPanel, LinksPanel, ProblemsPanel, SitesPanel, buildProbRows, describeTarget, isAckd, linkLabel,
  type DetailTab, type Target,
} from "./wtop-panels";
import "./wtop.css";

interface WtopScreenProps {
  /** Papel do usuário; VIEWER não vê ações que alteram estado. */
  role: string;
  /** Usa o snapshot de exemplo local (?mock=1), sem backend. */
  mock?: boolean;
  /** Modo TV (?tv=1): sem ações e sem rodapé. */
  tv?: boolean;
}

const HELP: HelpRow[] = [
  ["1 – 4", "focar painel links / sedes / problemas / dispositivos"],
  ["tab", "próximo painel (shift+tab: anterior)"],
  ["j / k", "mover no painel focado (setas também)"],
  ["⏎", "abrir no DETALHE (em sedes: filtrar por sede)"],
  ["/", "filtro dos dispositivos (sede:ita tipo:switch off texto)"],
  ["g b/o/i/t", "unidade: Barra / Botafogo / Itaguaí / todas"],
  ["ctrl+k  :", "paleta de comandos e ativos"],
  ["p w c", "ping (rechecar) / abrir web / copiar IP"],
  ["a  s", "ack / silenciar (operador e admin)"],
  ["esc", "fechar paleta, ajuda, filtro ou detalhe"],
];

const G_SITES: Record<string, SiteFilter> = { b: "BAR", o: "BOT", i: "ITA", t: "ALL" };

const targetOfProblem = (p: TowerProblem): Target => ({ type: p.kind === "LINK" ? "link" : p.kind === "AP" ? "ap" : "dev", id: p.entityId });
const targetOfChild = (c: { id: string; kind: "LINK" | "DISP" | "AP" }): Target => ({ type: c.kind === "LINK" ? "link" : c.kind === "AP" ? "ap" : "dev", id: c.id });

/** Problema do alvo (real, se houver; senão sintético) para reaproveitar as ações de tower-actions. */
function problemFor(t: Target, snap: TowerSnapshot): TowerProblem {
  const kind = t.type === "link" ? "LINK" : t.type === "ap" ? "AP" : "DISP";
  const real = snap.problems.find((p) => p.kind === kind && p.entityId === t.id);
  if (real) return real;
  return { id: `${kind}:${t.id}`, kind, entityId: t.id, site: null, name: "", severity: "info", what: "", why: "", sinceSec: 0, children: [], acknowledged: false, ackBy: null, ackNote: null };
}

/** Interface wtop (btop literal): links, sedes, problemas e dispositivos numerados, DETALHE e paleta de comandos. */
export function WtopScreen({ role, mock = false, tv = false }: WtopScreenProps) {
  const router = useRouter();
  const mockSnap = useMemo(() => (mock ? buildMockSnapshot() : null), [mock]);
  const { data, error, ageSec, fetchedAt, frozen, refresh } = useTower(mockSnap);
  const { msg, show } = useToast();
  const canAct = role !== "VIEWER" && !tv;

  const [site, setSite] = useState<SiteFilter>("ALL");
  const [focus, setFocus] = useState<1 | 2 | 3 | 4>(3);
  const [sel, setSel] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [target, setTarget] = useState<Target | null>(null);
  const [tab, setTab] = useState<DetailTab>("resumo");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortSpec>({ key: "st", dir: 1 });
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const gPending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCrit = useRef<Set<string> | null>(null);

  const inSite = useCallback((s: string | null) => site === "ALL" || s === site, [site]);

  // ── listas visíveis ──
  const links = useMemo(() => (data?.links ?? []).filter((l) => inSite(l.site)), [data, inSite]);
  const sites = useMemo(() => (data?.sites ?? []).filter((s) => inSite(s.site)), [data, inSite]);
  const problems = useMemo(
    () =>
      (data?.problems ?? [])
        .filter((p) => inSite(p.site))
        .slice()
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.sinceSec - a.sinceSec),
    [data, inSite],
  );
  const probRows = useMemo(() => buildProbRows(problems), [problems]);
  const parsed = useMemo(() => parseFilter(query), [query]);
  const devices = useMemo(
    () => sortDevices((data?.devices ?? []).filter((d) => inSite(d.site) && matchesFilter(d, parsed)), sort),
    [data, inSite, parsed, sort],
  );

  const sizes: Record<number, number> = { 1: links.length, 2: sites.length, 3: probRows.length, 4: devices.length };
  const at = (n: number) => Math.max(0, Math.min(sizes[n] - 1, sel[n] ?? 0));

  const openCount = (data?.problems ?? []).filter((p) => p.severity !== "ack" && !p.acknowledged).length;
  useEffect(() => {
    const prev = document.title;
    document.title = `(${openCount}) WatchIT`;
    return () => { document.title = prev; };
  }, [openCount]);

  // Leitor de tela: anuncia apenas problemas que passaram a crítico (não os já críticos no primeiro carregamento).
  useEffect(() => {
    if (!data) return;
    const crit = new Map(data.problems.filter((p) => p.severity === "crit" && !p.acknowledged).map((p) => [p.id, p]));
    const prev = prevCrit.current;
    prevCrit.current = new Set(crit.keys());
    if (!prev) return;
    const fresh = [...crit.values()].filter((p) => !prev.has(p.id));
    if (fresh.length) setAnnounce(`Novo alerta crítico: ${fresh.map((p) => `${p.name} ${p.what}`).join(", ")}`);
  }, [data]);

  // ── navegação ──
  const focusPanel = (n: 1 | 2 | 3 | 4) => {
    setFocus(n);
    const el = document.getElementById(`p${n}`);
    if (el && typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches) el.scrollIntoView?.({ block: "nearest" });
  };

  const move = (delta: number) => {
    const n = sizes[focus];
    if (!n) return;
    let i = at(focus);
    do {
      i = Math.max(0, Math.min(n - 1, i + delta));
    } while (focus === 3 && probRows[i]?.more && i > 0 && i < n - 1);
    if (focus === 3 && probRows[i]?.more) i = Math.max(0, i - 1);
    setSel((s) => ({ ...s, [focus]: i }));
  };

  const open = (t: Target | null) => {
    if (!t) return;
    setTarget(t);
    setTab("resumo");
    setSilenceOpen(false);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches) document.getElementById("pd")?.scrollIntoView?.({ block: "nearest" });
  };

  const openAt = (n: 1 | 2 | 3 | 4, i: number) => {
    setFocus(n);
    setSel((s) => ({ ...s, [n]: i }));
    if (n === 1) { const l = links[i]; if (l) open({ type: "link", id: l.id }); }
    else if (n === 2) {
      const s = sites[i];
      if (s) { const next: SiteFilter = !s.site || site === s.site ? "ALL" : s.site; setSite(next); show(next === "ALL" ? "Todas as sedes" : `Filtrando por ${s.name}`); }
    } else if (n === 3) {
      const r = probRows[i];
      if (r && !r.more) open(r.child ? targetOfChild(r.child) : targetOfProblem(r.problem));
    } else { const d = devices[i]; if (d) open({ type: "dev", id: d.id }); }
  };

  const changeSite = (s: SiteFilter) => {
    setSite(s);
    setSel({ 1: 0, 2: 0, 3: 0, 4: 0 });
    show(s === "ALL" ? "Todas as sedes" : `Sede: ${SITE_NAMES[s]}`);
  };

  const onSort = (k: SortKey) => {
    setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }));
    setFocus(4);
  };

  // ── ações do detalhe ──
  const info = data ? describeTarget(data, target) : null;
  const prob = data && target ? problemFor(target, data) : null;
  const item = info?.item as { acknowledged?: boolean; maintenanceUntil?: string | null } | undefined;
  const acked = !!(prob && (isAckd(prob) || item?.acknowledged));
  const maintenance = item?.maintenanceUntil ?? null;

  async function run(label: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (mock) { show(`${label} (simulação)`); return; }
    setBusy(true);
    try {
      const r = await fn();
      show(r.ok ? label : `Falhou: ${r.message}`);
      if (r.ok) refresh();
    } finally { setBusy(false); }
  }

  const act = async (k: "p" | "w" | "c" | "a" | "s") => {
    if (!data || !target || !info || !prob) { show("Abra um item no DETALHE primeiro (⏎)"); return; }
    if (k === "w") {
      if (!info.ip) { show("Sem IP conhecido para abrir"); return; }
      window.open(`http://${info.ip}`, "_blank", "noopener,noreferrer");
    } else if (k === "c") {
      if (!info.ip) { show("Sem IP para copiar"); return; }
      show((await copyText(info.ip)) ? `IP copiado: ${info.ip}` : info.ip);
    } else if (!canAct) {
      return;
    } else if (k === "p") {
      await run(`Ping de ${info.title}`, () => recheck(recheckType(prob, data)));
    } else if (k === "a") {
      await run(acked ? `Ack removido de ${info.title}` : `Ack registrado em ${info.title}`, () => (acked ? unackProblem(prob) : ackProblem(prob)));
    } else {
      setSilenceOpen(true);
    }
  };

  const pickSilence = (minutes: number | null) => {
    if (!prob || !info) return;
    setSilenceOpen(false);
    if (minutes === null) void run(`Silêncio removido de ${info.title}`, () => unsilenceProblem(prob));
    else void run(`${info.title} silenciado por ${minutes / 60}h`, () => silenceProblem(prob, minutes));
  };

  // ── paleta ──
  const paletteItems = useMemo<PaletteItem[]>(() => {
    const go = (id: string, label: string, href: string): PaletteItem => ({ id: `cmd:${id}`, kind: "cmd", label, run: () => router.push(href) });
    const cmds: PaletteItem[] = [
      go("reports", "ir para relatórios · /reports", "/reports"),
      go("profile", "ir para perfil · /profile", "/profile"),
    ];
    if (role === "ADMIN") {
      cmds.push(go("users", "ir para usuários · /users", "/users"), go("system", "ir para sistema · /system", "/system"), go("audit", "ir para auditoria · /audit", "/audit"));
    }
    if (canAct) cmds.push(go("new", "novo dispositivo · /devices/new", "/devices/new"));
    const assets: PaletteItem[] = [
      ...(data?.links ?? []).map((l) => ({ id: `link:${l.id}`, kind: "link" as const, label: `${linkLabel(l)} ${fmtMbps(l.contractedDownBps)}`, run: () => open({ type: "link", id: l.id }) })),
      ...(data?.devices ?? []).map((d) => ({ id: `disp:${d.id}`, kind: "disp" as const, label: `${d.name} ${d.ip}`, run: () => open({ type: "dev", id: d.id }) })),
      ...(data?.aps ?? []).map((a) => ({ id: `ap:${a.id}`, kind: "ap" as const, label: a.name, run: () => open({ type: "ap", id: a.id }) })),
    ];
    return [...cmds, ...assets];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, role, canAct, router]);

  // ── teclado ──
  const closeTop = () => {
    if (palette) setPalette(false);
    else if (help) setHelp(false);
    else if (document.activeElement === filterRef.current) filterRef.current?.blur();
    else if (silenceOpen) setSilenceOpen(false);
    else setTarget(null);
  };

  const keys: HotkeyMap = { Escape: closeTop };
  if (!palette) {
    Object.assign(keys, { "?": () => setHelp((h) => !h), "Ctrl+k": () => setPalette(true), ":": () => setPalette(true) });
    if (!help) {
      Object.assign(keys, {
        j: () => move(1), k: () => move(-1), ArrowDown: () => move(1), ArrowUp: () => move(-1),
        Enter: () => openAt(focus, at(focus)),
        "/": () => { setFocus(4); filterRef.current?.focus(); },
        g: () => {
          if (gPending.current) clearTimeout(gPending.current);
          gPending.current = setTimeout(() => { gPending.current = null; }, 1200);
        },
        p: () => void act("p"), w: () => void act("w"), c: () => void act("c"), a: () => void act("a"), s: () => void act("s"),
      });
      for (const [k, s] of Object.entries(G_SITES)) {
        keys[k] = () => {
          if (!gPending.current) return;
          clearTimeout(gPending.current);
          gPending.current = null;
          changeSite(s);
        };
      }
      ([1, 2, 3, 4] as const).forEach((n) => { keys[String(n)] = () => focusPanel(n); });
      if (silenceOpen) SILENCE_OPTIONS_MIN.forEach((m, i) => { keys[String(i + 1)] = () => pickSilence(m); });
    }
  }
  useHotkeys(keys);
  useEffect(() => () => { if (gPending.current) clearTimeout(gPending.current); }, []);

  // Tab cicla os painéis só quando nenhum controle tem foco, para não quebrar a navegação nativa.
  const cycle = useRef<(back: boolean) => void>(() => {});
  cycle.current = (back) => setFocus((f) => (back ? ((f + 2) % 4) + 1 : (f % 4) + 1) as 1 | 2 | 3 | 4);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
      const a = document.activeElement;
      if (a && a !== document.body) return;
      e.preventDefault();
      cycle.current(e.shiftKey);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onFilterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); filterRef.current?.blur(); openAt(4, at(4)); }
    else if (e.key === "ArrowDown") { e.preventDefault(); filterRef.current?.blur(); setFocus(4); }
  };

  const filterMsg = (
    <>
      {parsed.unknown.length ? <span className="warn">ignorado: {parsed.unknown.join(" ")}</span> : null}
      {parsed.unknown.length && site !== "ALL" ? " · " : null}
      {site !== "ALL" ? `sede do topo: ${site}` : null}
      {!parsed.unknown.length && site === "ALL" ? "sede:bar|bot|ita · tipo:switch|ap|mk · off · texto livre" : null}
    </>
  );

  const hints: KeyHint[] = [
    { keys: ["1", "–", "4"], label: "painel" }, { keys: ["tab"], label: "próximo" }, { keys: ["j", "k"], label: "mover" },
    { keys: ["⏎"], label: "detalhe" }, { keys: ["/"], label: "filtro" }, { keys: ["g", "b/o/i/t"], label: "sede", hideSm: true },
    ...(canAct ? [{ keys: ["a"], label: "ack" }, { keys: ["s"], label: "silenciar" }] : []),
    { keys: [":"], label: "comandos" }, { keys: ["Ctrl", "K"], label: "paleta", hideSm: true }, { keys: ["?"], label: "ajuda" },
  ];

  const chips: [string, SiteFilter, string][] = [["g t", "ALL", "todas"], ["g b", "BAR", "bar"], ["g o", "BOT", "bot"], ["g i", "ITA", "ita"]];

  return (
    <div className={`tui wtop${tv ? " tv" : ""}`}>
      <TopBar health={data?.health ?? null} ageSec={ageSec} frozen={frozen} site={site} onSite={changeSite} alerts={openCount} />
      <div className="site-row">
        <span>unidade</span>
        <span className="chips" style={{ display: "inline-flex" }} role="group" aria-label="Unidade (wtop)">
          {chips.map(([k, v, label]) => (
            <button key={v} type="button" className="chip" aria-pressed={site === v} onClick={() => changeSite(v)}>
              <kbd>{k}</kbd> {label}
            </button>
          ))}
        </span>
      </div>
      <FrozenBanner frozen={frozen} ageSec={ageSec} workerStale={data?.health.workerStatus === "stale"} error={error} />
      <div className="sr-only" role="alert">{announce}</div>

      {!data ? (
        <div className="grid">
          <Panel title="wtop" color="dim" full>
            <div className="dim">{error ? "Sem dados: não foi possível carregar o snapshot." : "carregando…"}</div>
          </Panel>
        </div>
      ) : (
        <main className="grid g-wtop">
          <LinksPanel links={links} sel={at(1)} focus={focus === 1} onFocus={() => focusPanel(1)} onPick={(i) => openAt(1, i)} />
          <SitesPanel sites={sites} sel={at(2)} focus={focus === 2} onFocus={() => focusPanel(2)} onPick={(i) => openAt(2, i)} activeSite={site === "ALL" ? "-" : site} />
          <ProblemsPanel rows={probRows} count={problems.length} sel={at(3)} focus={focus === 3} onFocus={() => focusPanel(3)} onPick={(i) => openAt(3, i)} fetchedAt={fetchedAt} />
          <DevicesPanel
            devices={devices} total={(data.devices ?? []).filter((d) => inSite(d.site)).length} sel={at(4)} sort={sort} query={query} message={filterMsg}
            filterRef={filterRef} focus={focus === 4} onFocus={() => focusPanel(4)} onQuery={(q) => { setQuery(q); setSel((s) => ({ ...s, 4: 0 })); }}
            onFilterKey={onFilterKey} onSort={onSort} onPick={(i) => openAt(4, i)}
          />
          <DetailPanel
            snap={data} target={target} tab={tab} onTab={setTab} fetchedAt={fetchedAt} canAct={canAct} busy={busy} acked={acked}
            silenceOpen={silenceOpen} maintenance={maintenance} onAction={(k) => void act(k)} onSilence={pickSilence}
            onCloseSilence={() => setSilenceOpen(false)} silenceOptions={SILENCE_OPTIONS_MIN}
          />
        </main>
      )}

      {!tv ? <KeyHints hints={hints} /> : null}
      <Toast msg={msg} />
      {help ? <HelpOverlay rows={HELP} onClose={() => setHelp(false)} /> : null}
      {palette ? <CommandPalette items={paletteItems} onClose={() => setPalette(false)} /> : null}
    </div>
  );
}
