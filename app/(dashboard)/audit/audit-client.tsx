"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { RefreshCw, ChevronLeft, ChevronRight, Search, X, Download, Trash2, CheckCircle, AlertCircle, Shield, Activity, LogIn, LogOut } from "lucide-react";

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

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE:       "Criação",
  UPDATE:       "Alteração",
  DELETE:       "Exclusão",
  LOGIN:        "Login",
  LOGIN_FAILED: "Login falhou",
  CLEANUP:      "Limpeza",
};

const ACTION_COLOR: Record<AuditAction, string> = {
  CREATE:       "bg-emerald-500/10 text-emerald-600",
  UPDATE:       "bg-blue-500/10 text-blue-600",
  DELETE:       "bg-destructive/10 text-destructive",
  LOGIN:        "bg-violet-500/10 text-violet-600",
  LOGIN_FAILED: "bg-amber-500/10 text-amber-600",
  CLEANUP:      "bg-orange-500/10 text-orange-600",
};

const ENTITY_LABEL: Record<string, string> = {
  Device: "Dispositivo", Link: "Link", User: "Usuário",
  SystemConfig: "Config. Sistema", System: "Sistema", Auth: "Autenticação", AuditLog: "Audit Log",
};

const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGIN_FAILED", "CLEANUP"];
const ENTITIES = ["Device", "Link", "User", "SystemConfig", "System", "Auth", "AuditLog"];

function StatCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4", accent ?? "text-primary")} />
      </div>
      <div className={cn("text-2xl font-bold", accent ?? "text-foreground")}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function AuditClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");

  // Purge
  const [purgeDays, setPurgeDays] = useState(365);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p) });
    if (filterAction) params.set("action", filterAction);
    if (filterEntity) params.set("entity", filterEntity);
    if (filterFrom)   params.set("from", filterFrom);
    if (filterTo)     params.set("to", filterTo);
    return params;
  }, [filterAction, filterEntity, filterFrom, filterTo]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const [logsRes, statsRes] = await Promise.all([
      fetch(`/api/admin/audit?${buildParams(p)}`, { cache: "no-store" }),
      fetch("/api/admin/audit/stats", { cache: "no-store" }),
    ]);
    if (logsRes.ok) {
      const data = await logsRes.json();
      setLogs(data.logs);
      setPagination(data.pagination);
    }
    if (statsRes.ok) setStats(await statsRes.json());
    setLoading(false);
  }, [buildParams]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  const filteredLogs = search
    ? logs.filter((l) =>
        l.entityName?.toLowerCase().includes(search.toLowerCase()) ||
        l.username?.toLowerCase().includes(search.toLowerCase()) ||
        l.ipAddress?.includes(search) ||
        l.entityId?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  function clearFilters() {
    setFilterAction(""); setFilterEntity(""); setFilterFrom(""); setFilterTo(""); setSearch("");
  }

  const hasFilters = filterAction || filterEntity || filterFrom || filterTo || search;

  function handleExport() {
    const params = buildParams(1);
    params.delete("page");
    window.open(`/api/admin/audit/export?${params}`, "_blank");
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
      load(1);
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setPurgeMsg({ ok: false, text: err.error ?? "Erro ao purgar." });
    }
    setPurging(false);
    setTimeout(() => setPurgeMsg(null), 6000);
  }

  const failedLogins24h = stats?.last24h["LOGIN_FAILED"] ?? 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar title="Logs de Alterações" subtitle="Histórico de todas as ações realizadas no sistema">
        <button onClick={handleExport} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
        <button onClick={() => load(page)} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Atualizar
        </button>
      </Topbar>

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Activity}  label="Ações (24h)"        value={stats?.total24h ?? "—"} sub={`${stats?.last24h["CREATE"] ?? 0} criações, ${stats?.last24h["DELETE"] ?? 0} exclusões`} />
          <StatCard icon={Activity}  label="Ações (7 dias)"     value={stats?.total7d ?? "—"}  sub={`${stats?.last7d["UPDATE"] ?? 0} alterações`} />
          <StatCard icon={LogIn}     label="Logins (7 dias)"    value={stats?.last7d["LOGIN"] ?? "—"} accent="text-violet-500" />
          <StatCard icon={Shield}    label="Falhas login (24h)" value={failedLogins24h} accent={failedLogins24h > 0 ? "text-destructive" : "text-emerald-500"} sub={failedLogins24h > 0 ? "Atenção: tentativas suspeitas" : "Sem tentativas suspeitas"} />
        </div>

        {/* Top users + recent logins */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border text-[13px] font-semibold">Usuários mais ativos (7 dias)</div>
              <div className="divide-y divide-border/50">
                {stats.topUsers.length === 0 && <div className="px-5 py-3 text-[13px] text-muted-foreground">Sem dados.</div>}
                {stats.topUsers.map((u, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center justify-between text-[13px]">
                    <span className="font-medium">{u.username ?? "Sistema"}</span>
                    <span className="text-muted-foreground tabular-nums">{u.actions} ações</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="px-5 py-3 border-b border-border text-[13px] font-semibold">Últimos acessos (7 dias)</div>
              <div className="divide-y divide-border/50">
                {stats.recentLogins.length === 0 && <div className="px-5 py-3 text-[13px] text-muted-foreground">Sem dados.</div>}
                {stats.recentLogins.map((l, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                    <div className="flex items-center gap-2 min-w-0">
                      {l.action === "LOGIN"
                        ? <LogIn className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                        : <LogOut className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      <span className="font-medium truncate">{l.entityName ?? "—"}</span>
                      {l.ipAddress && <span className="text-muted-foreground font-mono text-[11px]">{l.ipAddress}</span>}
                    </div>
                    <span className="text-muted-foreground tabular-nums whitespace-nowrap text-[12px]">{fmtDateTime(l.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-filter-action" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ação</label>
            <select id="audit-filter-action" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Todas</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-filter-entity" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Entidade</label>
            <select id="audit-filter-entity" value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Todas</option>
              {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-filter-from" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">De</label>
            <input id="audit-filter-from" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-filter-to" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Até</label>
            <input id="audit-filter-to" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-45">
            <label htmlFor="audit-filter-search" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Busca</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input id="audit-filter-search" placeholder="Nome, usuário, IP ou ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-[13px]" />
            </div>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] text-muted-foreground hover:text-foreground border border-input hover:bg-muted transition-colors">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpar
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[13px] font-semibold">{pagination.total.toLocaleString("pt-BR")} registros</span>
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span>Página {pagination.page} de {Math.max(1, pagination.totalPages)}</span>
              <button onClick={() => { const p = page - 1; setPage(p); load(p); }} disabled={page <= 1}
                aria-label="Página anterior"
                className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button onClick={() => { const p = page + 1; setPage(p); load(p); }} disabled={page >= pagination.totalPages}
                aria-label="Próxima página"
                className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" aria-label="Log de auditoria">
              <thead>
                <tr className="border-b border-border">
                  {["Data/Hora", "Usuário", "IP", "Ação", "Entidade", "Nome / ID", "Detalhes"].map((h) => (
                    <th key={h} className="text-left px-5 py-2.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Carregando…</td></tr>}
                {!loading && filteredLogs.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>}
                {!loading && filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{fmtDateTime(log.timestamp)}</td>
                    <td className="px-5 py-3">
                      {log.username ? <span className="font-medium">{log.username}</span> : <span className="text-muted-foreground italic text-[12px]">Sistema</span>}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">{log.ipAddress ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide", ACTION_COLOR[log.action])}>
                        {ACTION_LABEL[log.action]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{ENTITY_LABEL[log.entity] ?? log.entity}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{log.entityName ?? "—"}</div>
                      {log.entityId && <div className="text-[11px] text-muted-foreground font-mono">{log.entityId}</div>}
                    </td>
                    <td className="px-5 py-3 max-w-55">
                      {log.details
                        ? <code className="text-[11px] text-muted-foreground break-all">{JSON.stringify(log.details)}</code>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Purge section */}
        <div className="rounded-xl border border-destructive/30 bg-card">
          <div className="px-5 py-3.5 border-b border-destructive/30 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="text-[13px] font-semibold">Purga de logs de auditoria</span>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-[13px] text-muted-foreground">
              Remove permanentemente logs de auditoria mais antigos que o período especificado.
              Esta operação é <strong>irreversível</strong> e ela mesma será registrada como um novo log.
            </p>

            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="purge-days" className="text-[13px]">Remover logs com mais de</Label>
                <div className="flex items-center gap-2">
                  <Input id="purge-days" type="number" min={30} max={3650} value={purgeDays}
                    onChange={(e) => setPurgeDays(Number(e.target.value))} className="w-24 text-[13px]" />
                  <span className="text-[13px] text-muted-foreground">dias</span>
                </div>
              </div>
              <div className="space-y-1.5 flex-1 min-w-50">
                <Label htmlFor="purge-confirm" className="text-[13px]">
                  Digite <strong>CONFIRMAR</strong> para prosseguir
                </Label>
                <Input id="purge-confirm" placeholder="CONFIRMAR" value={purgeConfirm}
                  onChange={(e) => setPurgeConfirm(e.target.value)} className="text-[13px]" />
              </div>
            </div>

            {purgeMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                purgeMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive")}>
                {purgeMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {purgeMsg.text}
              </div>
            )}

            <Button variant="destructive" size="sm" onClick={runPurge}
              disabled={purging || purgeConfirm !== "CONFIRMAR"}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {purging ? "Purgando…" : "Executar purga"}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
