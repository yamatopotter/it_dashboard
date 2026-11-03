"use client";

import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Panel } from "@/components/tui/panel";
import { KeyHints } from "@/components/tui/key-hints";
import { TuiPage } from "@/components/tui/page";
import { EmptyBox, Field, StatusBadge, type BadgeLevel } from "@/components/tui/states";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { fmtDateTime } from "@/lib/format";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGIN_FAILED" | "CLEANUP";

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string | null;
  username: string | null;
  ipAddress: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  entityName: string | null;
  details: Record<string, unknown> | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AuditStats {
  last24h: Record<string, number>;
  last7d: Record<string, number>;
  total24h: number;
  total7d: number;
  recentLogins: { timestamp: string; action: string; entityName: string | null; ipAddress: string | null }[];
  topUsers: { username: string | null; actions: number }[];
}

interface Filters {
  action: string;
  entity: string;
  from: string;
  to: string;
}

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "criação",
  UPDATE: "alteração",
  DELETE: "exclusão",
  LOGIN: "login",
  LOGIN_FAILED: "login falhou",
  CLEANUP: "limpeza",
};

const ACTION_LEVEL: Record<AuditAction, BadgeLevel> = {
  CREATE: "ok",
  UPDATE: "info",
  DELETE: "crit",
  LOGIN: "dim",
  LOGIN_FAILED: "warn",
  CLEANUP: "warn",
};

const ENTITY_LABEL: Record<string, string> = {
  Device: "Dispositivo", Link: "Link", User: "Usuário",
  SystemConfig: "Config. Sistema", System: "Sistema", Auth: "Autenticação", AuditLog: "Audit Log",
};

const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGIN_FAILED", "CLEANUP"];
const ENTITIES = ["Device", "Link", "User", "SystemConfig", "System", "Auth", "AuditLog"];
const NO_FILTERS: Filters = { action: "", entity: "", from: "", to: "" };

function buildParams(f: Filters, page?: number) {
  const params = new URLSearchParams();
  if (page) params.set("page", String(page));
  if (f.action) params.set("action", f.action);
  if (f.entity) params.set("entity", f.entity);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  return params;
}

interface Loaded {
  key: string;
  logs: AuditLog[];
  pagination: Pagination | null;
  stats: AuditStats | null;
}

export function AuditClient() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Loaded | null>(null);
  const [sel, setSel] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Purge
  const [purgeDays, setPurgeDays] = useState(365);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const key = `${page}|${filters.action}|${filters.entity}|${filters.from}|${filters.to}|${tick}`;
  const loading = res?.key !== key;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [logsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/audit?${buildParams(filters, page)}`, { cache: "no-store" }).catch(() => null),
        fetch("/api/admin/audit/stats", { cache: "no-store" }).catch(() => null),
      ]);
      const data = logsRes?.ok ? await logsRes.json() : null;
      const stats = statsRes?.ok ? ((await statsRes.json()) as AuditStats) : null;
      if (alive) setRes({ key, logs: data?.logs ?? [], pagination: data?.pagination ?? null, stats });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const logs = res?.logs ?? [];
  const pagination = res?.pagination ?? { page: 1, pageSize: 50, total: 0, totalPages: 0 };
  const stats = res?.stats ?? null;
  const q = search.toLowerCase();
  const filteredLogs = search
    ? logs.filter((l) =>
        l.entityName?.toLowerCase().includes(q) ||
        l.username?.toLowerCase().includes(q) ||
        l.ipAddress?.includes(search) ||
        l.entityId?.toLowerCase().includes(q)
      )
    : logs;
  const selIdx = Math.min(sel, Math.max(0, filteredLogs.length - 1));

  function setFilter(k: keyof Filters, v: string) {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  }
  function clearFilters() {
    setFilters(NO_FILTERS);
    setSearch("");
    setPage(1);
  }
  const hasFilters = !!(filters.action || filters.entity || filters.from || filters.to || search);

  function handleExport() {
    window.open(`/api/admin/audit/export?${buildParams(filters)}`, "_blank");
  }

  async function runPurge() {
    if (purgeConfirm !== "CONFIRMAR") return;
    setPurging(true);
    setPurgeMsg(null);
    const res = await fetch("/api/admin/audit/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ olderThanDays: purgeDays, confirmation: "CONFIRMAR" }),
    });
    if (res.ok) {
      const data = await res.json();
      setPurgeMsg({ ok: true, text: `${data.deleted} registro(s) removido(s). Corte em: ${fmtDateTime(data.cutoff)}.` });
      setPurgeConfirm("");
      setPage(1);
      setTick((t) => t + 1);
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setPurgeMsg({ ok: false, text: err.error ?? "Erro ao purgar." });
    }
    setPurging(false);
  }

  useHotkeys({
    j: () => setSel(Math.min(selIdx + 1, filteredLogs.length - 1)),
    k: () => setSel(Math.max(selIdx - 1, 0)),
    "/": () => searchRef.current?.focus(),
    r: () => setTick((t) => t + 1),
    e: handleExport,
    n: () => setPage((p) => Math.min(p + 1, Math.max(1, pagination.totalPages))),
    p: () => setPage((p) => Math.max(1, p - 1)),
    Escape: () => (document.activeElement as HTMLElement | null)?.blur?.(),
  });

  const failedLogins24h = stats?.last24h["LOGIN_FAILED"] ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Logs de Alterações" subtitle="Histórico de todas as ações realizadas no sistema">
        <button type="button" className="tui-btn" onClick={handleExport}>exportar CSV</button>
        <button type="button" className="tui-btn" onClick={() => setTick((t) => t + 1)} aria-busy={loading}>
          {loading ? "carregando…" : "atualizar"}
        </button>
      </Topbar>

      <TuiPage>
        <div className="tui-stack">
          <Panel title="resumo" color="info">
            <div className="tui-kpis">
              <div className="tui-kpi">
                <span className="tui-kpi-l">ações 24h</span>
                <b className="tui-kpi-v">{stats?.total24h ?? "—"}</b>
                <span className="tui-hint">{stats?.last24h["CREATE"] ?? 0} criações, {stats?.last24h["DELETE"] ?? 0} exclusões</span>
              </div>
              <div className="tui-kpi">
                <span className="tui-kpi-l">ações 7 dias</span>
                <b className="tui-kpi-v">{stats?.total7d ?? "—"}</b>
                <span className="tui-hint">{stats?.last7d["UPDATE"] ?? 0} alterações</span>
              </div>
              <div className="tui-kpi">
                <span className="tui-kpi-l">logins 7 dias</span>
                <b className="tui-kpi-v">{stats?.last7d["LOGIN"] ?? "—"}</b>
              </div>
              <div className="tui-kpi">
                <span className="tui-kpi-l">falhas de login 24h</span>
                <b className={`tui-kpi-v ${failedLogins24h > 0 ? "tui-crit" : "tui-ok"}`}>
                  <span aria-hidden="true">{failedLogins24h > 0 ? "✖ " : "● "}</span>
                  {failedLogins24h}
                </b>
                <span className="tui-hint">{failedLogins24h > 0 ? "atenção: tentativas suspeitas" : "sem tentativas suspeitas"}</span>
              </div>
            </div>
          </Panel>

          {stats && (
            <div className="tui-grid tui-cols-2">
              <Panel title="usuários mais ativos" sub="7 dias" color="accent2">
                {stats.topUsers.length === 0 ? <EmptyBox title="Sem dados." /> : (
                  <table className="tui-table">
                    <tbody>
                      {stats.topUsers.map((u, i) => (
                        <tr key={i}>
                          <td>{u.username ?? "Sistema"}</td>
                          <td className="tui-num">{u.actions} ações</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
              <Panel title="últimos acessos" sub="7 dias" color="accent2">
                {stats.recentLogins.length === 0 ? <EmptyBox title="Sem dados." /> : (
                  <table className="tui-table">
                    <tbody>
                      {stats.recentLogins.map((l, i) => (
                        <tr key={i}>
                          <td className={l.action === "LOGIN" ? "tui-ok" : "tui-warn"}>
                            <span aria-hidden="true">{l.action === "LOGIN" ? "● " : "▲ "}</span>
                            <span className="sr-only">{l.action === "LOGIN" ? "login" : "falha"}</span>
                            {l.entityName ?? "—"}
                          </td>
                          <td className="tui-dim">{l.ipAddress ?? ""}</td>
                          <td className="tui-num tui-dim">{fmtDateTime(l.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>
          )}

          <Panel title="filtros" color="info" right={hasFilters ? <button type="button" onClick={clearFilters}>[limpar]</button> : undefined}>
            <div className="tui-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <Field id="audit-filter-action" label="Ação">
                <select id="audit-filter-action" className="tui-input" value={filters.action} onChange={(e) => setFilter("action", e.target.value)}>
                  <option value="">Todas</option>
                  {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
                </select>
              </Field>
              <Field id="audit-filter-entity" label="Entidade">
                <select id="audit-filter-entity" className="tui-input" value={filters.entity} onChange={(e) => setFilter("entity", e.target.value)}>
                  <option value="">Todas</option>
                  {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>)}
                </select>
              </Field>
              <Field id="audit-filter-from" label="De">
                <input id="audit-filter-from" type="date" className="tui-input" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
              </Field>
              <Field id="audit-filter-to" label="Até">
                <input id="audit-filter-to" type="date" className="tui-input" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
              </Field>
              <Field id="audit-filter-search" label="Busca (/)">
                <input id="audit-filter-search" ref={searchRef} className="tui-input" placeholder="nome, usuário, IP ou ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel
            title="registros"
            sub={`${pagination.total.toLocaleString("pt-BR")} · página ${pagination.page} de ${Math.max(1, pagination.totalPages)}`}
            color="info"
            right={
              <>
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Página anterior">[p ‹]</button>{" "}
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages} aria-label="Próxima página">[› n]</button>
              </>
            }
          >
            <div className="tui-table-wrap">
              <table className="tui-table" aria-label="Log de auditoria" aria-busy={loading}>
                <thead>
                  <tr>
                    {["Data/Hora", "Usuário", "IP", "Ação", "Entidade", "Nome / ID", "Detalhes"].map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7}><span className="tui-skel" style={{ width: "60%" }} /></td></tr>}
                  {!loading && filteredLogs.length === 0 && <tr><td colSpan={7}><EmptyBox title="Nenhum registro encontrado." hint={hasFilters ? "Ajuste ou limpe os filtros." : undefined} /></td></tr>}
                  {!loading && filteredLogs.map((log, i) => (
                    <tr key={log.id} className={`clickable${i === selIdx ? " sel" : ""}`} aria-selected={i === selIdx} onClick={() => setSel(i)}>
                      <td className="tui-dim" style={{ whiteSpace: "nowrap" }}>{fmtDateTime(log.timestamp)}</td>
                      <td>{log.username ?? <span className="tui-dim">Sistema</span>}</td>
                      <td className="tui-dim">{log.ipAddress ?? "—"}</td>
                      <td><StatusBadge level={ACTION_LEVEL[log.action]}>{ACTION_LABEL[log.action]}</StatusBadge></td>
                      <td className="tui-dim">{ENTITY_LABEL[log.entity] ?? log.entity}</td>
                      <td>
                        <div>{log.entityName ?? "—"}</div>
                        {log.entityId && <div className="tui-dim" style={{ fontSize: 11 }}>{log.entityId}</div>}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        {log.details
                          ? <code className="tui-dim" style={{ fontSize: 11, wordBreak: "break-all" }}>{JSON.stringify(log.details)}</code>
                          : <span className="tui-dim">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="purga de logs" color="crit">
            <p style={{ margin: "0 0 12px" }} className="tui-dim">
              Remove permanentemente logs de auditoria mais antigos que o período especificado.
              Esta operação é <strong>irreversível</strong> e ela mesma será registrada como um novo log.
            </p>
            <div className="tui-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <Field id="purge-days" label="Remover logs com mais de (dias)">
                <input id="purge-days" type="number" min={30} max={3650} className="tui-input" value={purgeDays} onChange={(e) => setPurgeDays(Number(e.target.value))} />
              </Field>
              <Field id="purge-confirm" label="Digite CONFIRMAR para prosseguir">
                <input id="purge-confirm" className="tui-input" placeholder="CONFIRMAR" value={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.value)} />
              </Field>
            </div>
            {purgeMsg && (
              <div className={purgeMsg.ok ? "tui-note ok" : "tui-error"} role="status" style={{ marginTop: 12 }}>
                {purgeMsg.ok ? "● " : null}{purgeMsg.text}
              </div>
            )}
            <div className="tui-btns" style={{ marginTop: 12 }}>
              <button type="button" className="tui-btn tui-btn-danger" onClick={runPurge} disabled={purging || purgeConfirm !== "CONFIRMAR"}>
                {purging ? "Purgando…" : "Executar purga"}
              </button>
            </div>
          </Panel>
        </div>
        <KeyHints
          hints={[
            { keys: ["j", "k"], label: "linha" },
            { keys: ["/"], label: "buscar" },
            { keys: ["n", "p"], label: "página" },
            { keys: ["r"], label: "atualizar" },
            { keys: ["e"], label: "exportar CSV", hideSm: true },
          ]}
        />
      </TuiPage>
    </div>
  );
}
