"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Computer } from "@prisma/client";
import type { ComputerPaginatedResponse } from "@/app/api/computers/route";
import { Panel } from "@/components/tui/panel";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkChips, LnkEmpty, LnkError, LnkLoading, LnkToggle } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useListNav } from "@/hooks/use-list-nav";
import { fmtDateTime } from "@/lib/format";

const PAGE_LIMIT = 25;

type OnlineFilter = "ALL" | "true" | "false";

/** Prioridade do alerta Datto: severidade por cor + glifo. */
const PRIORITY: Record<string, { cls: "crit" | "warn" | "info" | "dim"; glyph: string; label: string }> = {
  Critical: { cls: "crit", glyph: "✖", label: "crítico" },
  High: { cls: "crit", glyph: "✖", label: "alto" },
  Moderate: { cls: "warn", glyph: "▲", label: "moderado" },
  Low: { cls: "info", glyph: "·", label: "baixo" },
  Information: { cls: "dim", glyph: "·", label: "informação" },
};

const HELP: HelpRow[] = [
  ["j k", "selecionar computador (↓ ↑ também)"],
  ["1 2 3", "estado: todos / online / offline"],
  ["a", "somente com alertas abertos"],
  ["m", "carregar mais"],
  ["r", "atualizar"],
  ["/", "buscar nos carregados"],
  ["esc", "fechar busca ou ajuda"],
];

export default function ComputersPage() {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [onlineFilter, setOnlineFilter] = useState<OnlineFilter>("ALL");
  const [alertsFilter, setAlertsFilter] = useState(false);
  const [q, setQ] = useState("");
  const [help, setHelp] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchPage = async (p: number, replace: boolean) => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_LIMIT));

      if (onlineFilter !== "ALL") params.set("online", onlineFilter);
      if (alertsFilter) params.set("hasAlerts", "true");

      const res = await fetch(`/api/computers?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ComputerPaginatedResponse = await res.json();
      const newComputers = replace ? data.data : [...computers, ...(data.data || [])];
      setComputers(newComputers.filter((c) => c !== null) as Computer[]);
      setHasMore(data.page < Math.ceil(data.total / PAGE_LIMIT));
      setTotal(data.total);
      setPage(p);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error("[computers] erro ao carregar página:", err);
      if (replace) setError("Não foi possível carregar os computadores.");
      toast.error("Erro ao carregar computadores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Recarrega ao trocar filtros: sincroniza com a API (sistema externo); o setState ocorre após o await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineFilter, alertsFilter]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return computers;
    return computers.filter((c) => [c.hostname, c.siteName, c.operatingSystem, c.lastLoggedInUser, c.intIpAddress].some((v) => v?.toLowerCase().includes(needle)));
  }, [computers, q]);

  const nav = useListNav(shown.length);

  const keys: HotkeyMap = {
    "?": () => setHelp((h) => !h),
    Escape: (e) => {
      if (help) return setHelp(false);
      const t = e.target as HTMLElement | null;
      if (t?.id === "lnk-q") { setQ(""); t.blur(); }
    },
  };
  if (!help) {
    Object.assign(keys, nav.keys, {
      "/": () => document.getElementById("lnk-q")?.focus(),
      "1": () => setOnlineFilter("ALL"),
      "2": () => setOnlineFilter("true"),
      "3": () => setOnlineFilter("false"),
      a: () => setAlertsFilter((v) => !v),
      m: () => { if (hasMore) void fetchPage(page + 1, false); },
      r: () => void fetchPage(1, true),
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["j", "k"], label: "selecionar" },
    { keys: ["1", "–", "3"], label: "estado" },
    { keys: ["a"], label: "alertas" },
    ...(hasMore ? [{ keys: ["m"], label: "mais" }] : []),
    { keys: ["r"], label: "atualizar", hideSm: true },
    { keys: ["/"], label: "buscar", hideSm: true },
    { keys: ["?"], label: "ajuda" },
  ];

  return (
    <LnkShell
      title="COMPUTADORES"
      sub={loading ? "inventário sincronizado do Datto RMM" : `${total} no inventário · Datto RMM`}
      updatedAt={updatedAt}
      hints={hints}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      <Panel title="inventário" sub={loading ? undefined : `${shown.length} exibidos`} color="info">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <LnkChips<OnlineFilter>
            label="Filtro de estado"
            value={onlineFilter}
            onChange={setOnlineFilter}
            chips={[
              { value: "ALL", label: "todos", key: "1" },
              { value: "true", label: "online", key: "2" },
              { value: "false", label: "offline", key: "3" },
            ]}
          />
          <LnkToggle label="com alertas" on={alertsFilter} onToggle={() => setAlertsFilter((v) => !v)} k="a" />
          <span className="spacer" />
          <input id="lnk-q" className="search" type="search" placeholder="/ buscar host, unidade, usuário, IP" aria-label="Buscar computador" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? (
          <LnkLoading what="computadores" />
        ) : error && computers.length === 0 ? (
          <LnkError message={error} onRetry={() => fetchPage(1, true)} />
        ) : shown.length === 0 ? (
          computers.length === 0 ? (
            <LnkEmpty title="Nenhum computador sincronizado" hint="Configure a integração Datto RMM em Sistema para trazer o inventário de máquinas." />
          ) : (
            <LnkEmpty title="Nenhum computador encontrado para a busca." />
          )
        ) : (
          <div className="tblwrap">
            <table className="tbl" aria-label="Computadores">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Estado</span></th>
                  <th scope="col">Host</th>
                  <th scope="col" className="hide-md">Sistema / usuário</th>
                  <th scope="col" className="hide-md">IP</th>
                  <th scope="col" className="hide-md">Visto por último</th>
                  <th scope="col">Alertas</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c, i) => {
                  const pr = c.highestAlertPriority ? (PRIORITY[c.highestAlertPriority] ?? { cls: "dim" as const, glyph: "·", label: c.highestAlertPriority }) : null;
                  return (
                    <tr
                      key={c.id}
                      className={i === nav.sel ? "sel" : undefined}
                      data-sel={i === nav.sel ? "true" : undefined}
                      aria-current={i === nav.sel ? "true" : undefined}
                      onClick={() => nav.setSel(i)}
                      style={{ cursor: "default" }}
                    >
                      <td className="keep" style={{ width: "3ch" }}>
                        <StateGlyph state={c.online ? "ok" : "crit"} label={c.online ? "online" : "offline"} />
                      </td>
                      <td>
                        <span className="nm">{c.hostname}</span>
                        <span className="sm">{c.siteName}</span>
                      </td>
                      <td className="hide-md">
                        {c.operatingSystem ?? <span className="dim">—</span>}
                        {c.lastLoggedInUser && <span className="sm">{c.lastLoggedInUser}</span>}
                      </td>
                      <td className="hide-md">{c.intIpAddress ?? <span className="dim">—</span>}</td>
                      <td className="hide-md dim">{c.lastSeenAt ? fmtDateTime(c.lastSeenAt) : "—"}</td>
                      <td className="keep">
                        {pr ? (
                          <span className={pr.cls} title={`prioridade ${pr.label}`}>
                            {pr.glyph} {c.openAlertsCount} {c.openAlertsCount === 1 ? "alerta" : "alertas"} ({c.highestAlertPriority})
                          </span>
                        ) : <span className="dim">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !loading && (
          <div className="btns" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => fetchPage(page + 1, false)}>
              <kbd>m</kbd>carregar mais
            </button>
          </div>
        )}
      </Panel>
    </LnkShell>
  );
}
