"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DeviceDetailDrawer } from "@/components/device-detail-drawer";
import { Panel } from "@/components/tui/panel";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkChips, LnkEmpty, LnkError, LnkLoading } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useListNav } from "@/hooks/use-list-nav";
import { DEVICE_TYPE_LABEL } from "@/lib/device-constants";
import { formatDuration, timeAgo, fmtTime, fmtDate } from "@/lib/format";
import type { Incident, PaginatedIncidentsResponse } from "@/app/api/incidents/route";

type Window = 24 | 168 | 720;
type StatusFilter = "ALL" | "OPEN" | "RESOLVED";

const WINDOWS: { label: string; value: Window }[] = [
  { label: "24h", value: 24 },
  { label: "7d", value: 168 },
  { label: "30d", value: 720 },
];

const PAGE_LIMIT = 25;

const HELP: HelpRow[] = [
  ["j k", "selecionar incidente (↓ ↑ também)"],
  ["⏎", "abrir o dispositivo do incidente"],
  ["1 2 3", "filtro: todos / em aberto / resolvidos"],
  ["4 5 6", "período: 24h / 7d / 30d"],
  ["m", "carregar mais incidentes"],
  ["/", "buscar dispositivo ou IP"],
  ["esc", "fechar painel, busca ou ajuda"],
];

/** Duração do incidente resolvido: longa = crítico, média = aviso, curta = neutro. */
function durationClass(durationMs: number | null) {
  if (durationMs == null) return "dim";
  const min = durationMs / 60_000;
  return min >= 60 ? "crit" : min >= 5 ? "warn" : "dim";
}

function groupByDay(incidents: Incident[]) {
  const groups: Map<string, Incident[]> = new Map();
  for (const inc of incidents) {
    const day = fmtDate(inc.startAt, { weekday: "long", day: "numeric", month: "long" });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(inc);
  }
  return groups;
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [window, setWindow] = useState<Window>(168);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");
  const [drawerDeviceId, setDrawerDeviceId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchPage = async (hours: number, p: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);

    try {
      const r = await fetch(`/api/incidents?hours=${hours}&page=${p}&limit=${PAGE_LIMIT}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: PaginatedIncidentsResponse = await r.json();
      setIncidents((prev) => replace ? (data.data ?? []) : [...prev, ...(data.data ?? [])]);
      setTotal(data.total ?? 0);
      setHasMore(data.hasMore ?? false);
      setPage(p);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error("[incidents] falha ao carregar página:", err);
      if (replace) setError("Não foi possível carregar os incidentes.");
      toast.error("Erro ao carregar incidentes");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    // Recarrega ao trocar filtros: sincroniza com a API (sistema externo); o setState ocorre após o await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(window, 1, true);
  }, [window]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return incidents.filter((inc) => {
      if (statusFilter === "OPEN" && inc.resolved) return false;
      if (statusFilter === "RESOLVED" && !inc.resolved) return false;
      if (!needle) return true;
      return inc.deviceName.toLowerCase().includes(needle) || inc.deviceIp.toLowerCase().includes(needle);
    });
  }, [incidents, statusFilter, q]);

  const openCount = incidents.filter((i) => !i.resolved).length;
  const resolvedCount = incidents.filter((i) => i.resolved).length;

  const grouped = groupByDay(filtered);
  // Índice global (na ordem exibida) para seleção por teclado entre grupos
  const flat = Array.from(grouped.values()).flat();
  const nav = useListNav(flat.length);
  const selectedInc = flat[nav.sel];

  const keys: HotkeyMap = {
    "?": () => setHelp((h) => !h),
    Escape: (e) => {
      if (help) return setHelp(false);
      const t = e.target as HTMLElement | null;
      if (t?.id === "lnk-q") { setQ(""); t.blur(); }
    },
  };
  if (!help && !drawerDeviceId) {
    Object.assign(keys, nav.keys, {
      "/": () => document.getElementById("lnk-q")?.focus(),
      Enter: () => selectedInc && setDrawerDeviceId(selectedInc.deviceId),
      "1": () => setStatusFilter("ALL"),
      "2": () => setStatusFilter("OPEN"),
      "3": () => setStatusFilter("RESOLVED"),
      "4": () => setWindow(24),
      "5": () => setWindow(168),
      "6": () => setWindow(720),
      m: () => { if (hasMore && !loadingMore) void fetchPage(window, page + 1, false); },
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["j", "k"], label: "selecionar" },
    { keys: ["⏎"], label: "abrir dispositivo" },
    { keys: ["1", "–", "3"], label: "estado" },
    { keys: ["4", "–", "6"], label: "período", hideSm: true },
    ...(hasMore ? [{ keys: ["m"], label: "carregar mais" }] : []),
    { keys: ["/"], label: "buscar", hideSm: true },
    { keys: ["?"], label: "ajuda" },
  ];

  const windowLabel = WINDOWS.find((w) => w.value === window)?.label;
  const indexOf = new Map(flat.map((inc, i) => [inc.id, i] as const));

  return (
    <LnkShell
      title="INCIDENTES"
      sub={
        loading ? undefined : (
          <>
            <span className={openCount > 0 ? "crit" : "ok"}>{openCount > 0 ? `✖ ${openCount} em aberto` : "● nenhum em aberto"}</span>
            {` · ${resolvedCount} resolvidos${total > incidents.length ? ` · ${total} no total` : ""}`}
          </>
        )
      }
      updatedAt={updatedAt}
      hints={hints}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      <div className="toolbar">
        <LnkChips<StatusFilter>
          label="Filtro de estado"
          value={statusFilter}
          onChange={setStatusFilter}
          chips={[
            { value: "ALL", label: "todos", key: "1", count: incidents.length },
            { value: "OPEN", label: "em aberto", key: "2", count: openCount },
            { value: "RESOLVED", label: "resolvidos", key: "3", count: resolvedCount },
          ]}
        />
        <LnkChips<string>
          label="Período"
          value={String(window)}
          onChange={(v) => setWindow(Number(v) as Window)}
          chips={WINDOWS.map((w, i) => ({ value: String(w.value), label: w.label, key: String(i + 4) }))}
        />
        <span className="spacer" />
        <input id="lnk-q" className="search" type="search" placeholder="/ buscar dispositivo ou IP" aria-label="Buscar incidente" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <Panel title="linha do tempo" color="info"><LnkLoading what="incidentes" /></Panel>
      ) : error && incidents.length === 0 ? (
        <Panel title="linha do tempo" color="crit" hot><LnkError message={error} onRetry={() => fetchPage(window, 1, true)} /></Panel>
      ) : filtered.length === 0 ? (
        <Panel title="linha do tempo" sub={windowLabel} color="ok">
          <LnkEmpty
            ok
            title="Nenhum incidente"
            hint={statusFilter !== "ALL" || q ? "Sem incidentes para o filtro ou busca." : `Todos os dispositivos estiveram online nas últimas ${windowLabel}.`}
          />
        </Panel>
      ) : (
        Array.from(grouped.entries()).map(([day, items]) => (
          <Panel key={day} title={day} sub={`${items.length} ${items.length === 1 ? "incidente" : "incidentes"}`} color={items.some((i) => !i.resolved) ? "crit" : "info"} hot={items.some((i) => !i.resolved)}>
            <div className="tlist">
              {items.map((inc) => {
                const idx = indexOf.get(inc.id) ?? -1;
                const selected = idx === nav.sel;
                return (
                  <div
                    key={inc.id}
                    className={`tl${selected ? " sel" : ""}`}
                    data-sel={selected ? "true" : undefined}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => { nav.setSel(idx); setDrawerDeviceId(inc.deviceId); }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Incidente de ${inc.deviceName}, ${inc.resolved ? "resolvido" : "em aberto"}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrawerDeviceId(inc.deviceId); } }}
                  >
                    <span className="dim">{fmtTime(inc.startAt, { hour: "2-digit", minute: "2-digit" })}</span>
                    <StateGlyph state={inc.resolved ? "ok" : "crit"} label={inc.resolved ? "resolvido" : "em aberto"} />
                    <span>
                      <b>{inc.deviceName}</b>
                      <span className="dim"> {inc.deviceIp} · {DEVICE_TYPE_LABEL[inc.deviceType]} · {timeAgo(inc.startAt)}</span>
                    </span>
                    <span className="tl-end">
                      {inc.durationMs != null && <span className={durationClass(inc.durationMs)}>{formatDuration(inc.durationMs)} </span>}
                      <span className={inc.resolved ? "ok" : "crit"}>{inc.resolved ? "resolvido" : "EM ABERTO"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        ))
      )}

      {hasMore && (
        <div className="btns">
          <button type="button" className="btn" onClick={() => fetchPage(window, page + 1, false)} disabled={loadingMore}>
            <kbd>m</kbd>
            {loadingMore ? "carregando…" : `carregar mais (${total - incidents.length} restantes)`}
          </button>
        </div>
      )}

      <DeviceDetailDrawer deviceId={drawerDeviceId} onClose={() => setDrawerDeviceId(null)} />
    </LnkShell>
  );
}
