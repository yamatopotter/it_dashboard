"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";
import { ModulesCard } from "@/components/settings/modules-card";
import { CliqCard } from "@/components/settings/cliq-card";
import { TicketCard } from "@/components/settings/ticket-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { fmtDateTime, formatBytes } from "@/lib/format";
import {
  Database,
  Server,
  Clock,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Activity,
  Mail,
  Lock,
  Copy,
  Smartphone,
  Monitor,
} from "lucide-react";

interface TableStat {
  name: string;
  rowEstimate: number;
  totalSize: string;
  totalBytes: number;
}

interface Stats {
  database: { size: string; sizeBytes: number };
  tables: TableStat[];
  counts: {
    statusHistory: number;
    linkEvents: number;
    devices: number;
    users: number;

    links: number;
  };
  statusHistoryRange: { oldest: string | null; newest: string | null };
  worker: { lastSeenAt: string | null; isAlive: boolean };
  retention: {
    statusHistoryDays: number;
    linkEventDays: number;
    lastCleanupAt: string | null;
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue";
}) {
  const accentClass = {
    green: "text-emerald-500",
    amber: "text-amber-500",
    red: "text-destructive",
    blue: "text-primary",
  }[accent ?? "blue"];

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn("flex items-center justify-center w-8 h-8 rounded-lg bg-muted", accentClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <div className={cn("text-2xl font-bold", accentClass)}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

const TABLE_LABELS: Record<string, string> = {
  StatusHistory: "Histórico de status",
  LinkEvent: "Eventos de link",
  DeviceStatus: "Status atual",
  Device: "Dispositivos",
  Link: "Links",

  User: "Usuários",
  WorkerHeartbeat: "Worker heartbeat",
  SystemConfig: "Configuração",
};

export function SystemClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retentionHistory, setRetentionHistory] = useState(30);
  const [retentionEvents, setRetentionEvents] = useState(90);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cleanMsg, setCleanMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [alertEmailTo, setAlertEmailTo] = useState("");
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [zohoEnabled, setZohoEnabled] = useState(false);
  const [zohoClientId, setZohoClientId] = useState("");
  const [zohoClientSecret, setZohoClientSecret] = useState("");
  const [hasZohoClientSecret, setHasZohoClientSecret] = useState(false);
  const [zohoAccountsUrl, setZohoAccountsUrl] = useState("https://accounts.zoho.com");
  const [zohoSaving, setZohoSaving] = useState(false);
  const [zohoMsg, setZohoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [zohoUriCopied, setZohoUriCopied] = useState(false);

  const [miradoreSiteName, setMiradoreSiteName] = useState("");
  const [miradoreApiKey, setMiradoreApiKey] = useState("");
  const [hasMiradoreApiKey, setHasMiradoreApiKey] = useState(false);
  const [miradoreSyncEnabled, setMiradoreSyncEnabled] = useState(false);
  const [miradoreSyncIntervalMinutes, setMiradoreSyncIntervalMinutes] = useState(60);
  const [miradoreLastSyncAt, setMiradoreLastSyncAt] = useState<string | null>(null);
  const [miradoreLastSyncError, setMiradoreLastSyncError] = useState<string | null>(null);
  const [miradoreSaving, setMiradoreSaving] = useState(false);
  const [miradoreSyncing, setMiradoreSyncing] = useState(false);
  const [miradoreMsg, setMiradoreMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [dattoPlatform, setDattoPlatform] = useState("merlot");
  const [dattoApiKey, setDattoApiKey] = useState("");
  const [hasDattoApiKey, setHasDattoApiKey] = useState(false);
  const [dattoSecretKey, setDattoSecretKey] = useState("");
  const [hasDattoSecretKey, setHasDattoSecretKey] = useState(false);
  const [dattoSyncEnabled, setDattoSyncEnabled] = useState(false);
  const [dattoSyncIntervalMinutes, setDattoSyncIntervalMinutes] = useState(30);
  const [dattoLastSyncAt, setDattoLastSyncAt] = useState<string | null>(null);
  const [dattoLastSyncError, setDattoLastSyncError] = useState<string | null>(null);
  const [dattoSaving, setDattoSaving] = useState(false);
  const [dattoSyncing, setDattoSyncing] = useState(false);
  const [dattoMsg, setDattoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dattoSiteFilter, setDattoSiteFilter] = useState<string>(""); // "" = todos os sites
  const [dattoSites, setDattoSites] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (res.ok) {
        const data: Stats = await res.json();
        setStats(data);
        setRetentionHistory(data.retention.statusHistoryDays);
        setRetentionEvents(data.retention.linkEventDays);
      } else {
        const body = await res.text();
        console.error("[system] stats API error", res.status, body);
      }
    } catch (e) {
      console.error("[system] fetch error", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const loadSmtp = useCallback(async () => {
    const res = await fetch("/api/admin/config");
    if (!res.ok) return;
    const cfg = await res.json();
    setSmtpEnabled(cfg.smtpEnabled ?? false);
    setSmtpHost(cfg.smtpHost ?? "");
    setSmtpPort(cfg.smtpPort ?? 587);
    setSmtpSecure(cfg.smtpSecure ?? false);
    setSmtpUser(cfg.smtpUser ?? "");
    setSmtpFrom(cfg.smtpFrom ?? "");
    setAlertEmailTo(cfg.alertEmailTo ?? "");
    setHasSmtpPassword(!!cfg.hasSmtpPassword);
  }, []);

  const loadZoho = useCallback(async () => {
    const res = await fetch("/api/settings/zoho");
    if (!res.ok) return;
    const cfg = await res.json();
    setZohoEnabled(cfg.zohoEnabled ?? false);
    setZohoClientId(cfg.zohoClientId ?? "");
    setZohoAccountsUrl(cfg.zohoAccountsUrl ?? "https://accounts.zoho.com");
    setHasZohoClientSecret(!!cfg.hasClientSecret);
  }, []);

  const loadMiradore = useCallback(async () => {
    const res = await fetch("/api/settings/miradore");
    if (!res.ok) return;
    const cfg = await res.json();
    setMiradoreSiteName(cfg.miradoreSiteName ?? "");
    setHasMiradoreApiKey(!!cfg.hasApiKey);
    setMiradoreSyncEnabled(cfg.miradoreSyncEnabled ?? false);
    setMiradoreSyncIntervalMinutes(cfg.miradoreSyncIntervalMinutes ?? 60);
    setMiradoreLastSyncAt(cfg.miradoreLastSyncAt ?? null);
    setMiradoreLastSyncError(cfg.miradoreLastSyncError ?? null);
  }, []);

  const loadDatto = useCallback(async () => {
    const res = await fetch("/api/settings/datto");
    if (!res.ok) return;
    const cfg = await res.json();
    setDattoPlatform(cfg.dattoPlatform ?? "merlot");
    setHasDattoApiKey(!!cfg.hasApiKey);
    setHasDattoSecretKey(!!cfg.hasSecretKey);
    setDattoSyncEnabled(cfg.dattoSyncEnabled ?? false);
    setDattoSyncIntervalMinutes(cfg.dattoSyncIntervalMinutes ?? 30);
    setDattoLastSyncAt(cfg.dattoLastSyncAt ?? null);
    setDattoLastSyncError(cfg.dattoLastSyncError ?? null);
    setDattoSiteFilter(cfg.dattoSiteFilter ?? "");
  }, []);

  useEffect(() => { void Promise.resolve().then(() => { loadSmtp(); loadZoho(); loadMiradore(); loadDatto(); }); }, [loadSmtp, loadZoho, loadMiradore, loadDatto]);
  const loadDattoSites = useCallback(async () => {
    const res = await fetch("/api/computers/sites");
    if (!res.ok) return;
    const data = await res.json();
    setDattoSites(data.sites ?? []);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => { loadSmtp(); loadZoho(); loadMiradore(); loadDatto(); loadDattoSites(); }); }, [loadSmtp, loadZoho, loadMiradore, loadDatto, loadDattoSites]);

  async function saveSmtp() {
    setSmtpSaving(true);
    setSmtpMsg(null);
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        smtpEnabled,
        smtpHost: smtpHost || null,
        smtpPort,
        smtpSecure,
        smtpUser: smtpUser || null,
        smtpFrom: smtpFrom || null,
        alertEmailTo: alertEmailTo || null,
        // Write-only: omitido quando em branco mantém a senha já salva
        ...(smtpPassword ? { smtpPassword } : {}),
      }),
    });
    if (res.ok) {
      setSmtpMsg({ ok: true, text: "Configuração de e-mail salva com sucesso." });
      setSmtpPassword("");
      loadSmtp();
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setSmtpMsg({ ok: false, text: err.error ?? "Erro ao salvar." });
    }
    setSmtpSaving(false);
    setTimeout(() => setSmtpMsg(null), 4000);
  }

  async function saveZoho() {
    setZohoSaving(true);
    setZohoMsg(null);
    const res = await fetch("/api/settings/zoho", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zohoEnabled,
        zohoClientId: zohoClientId || null,
        zohoAccountsUrl,
        ...(zohoClientSecret ? { zohoClientSecret } : {}),
      }),
    });
    if (res.ok) {
      setZohoMsg({ ok: true, text: "Configuração do Zoho salva com sucesso." });
      setZohoClientSecret("");
      loadZoho();
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setZohoMsg({ ok: false, text: err.error ?? "Erro ao salvar." });
    }
    setZohoSaving(false);
    setTimeout(() => setZohoMsg(null), 4000);
  }

  async function saveMiradore() {
    setMiradoreSaving(true);
    setMiradoreMsg(null);
    const res = await fetch("/api/settings/miradore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        miradoreSiteName: miradoreSiteName || null,
        miradoreSyncEnabled,
        miradoreSyncIntervalMinutes,
        ...(miradoreApiKey ? { miradoreApiKey } : {}),
      }),
    });
    if (res.ok) {
      setMiradoreMsg({ ok: true, text: "Configuração do Miradore salva com sucesso." });
      setMiradoreApiKey("");
      loadMiradore();
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setMiradoreMsg({ ok: false, text: err.error ?? "Erro ao salvar." });
    }
    setMiradoreSaving(false);
    setTimeout(() => setMiradoreMsg(null), 4000);
  }

  async function syncMiradoreNow() {
    setMiradoreSyncing(true);
    setMiradoreMsg(null);
    const res = await fetch("/api/phones/sync", { method: "POST" });
    const data = await res.json().catch(() => ({ message: "Erro desconhecido" }));
    setMiradoreMsg({ ok: res.ok, text: data.message ?? (res.ok ? "Sincronização concluída." : "Erro ao sincronizar.") });
    loadMiradore();
    setMiradoreSyncing(false);
    setTimeout(() => setMiradoreMsg(null), 6000);
  }

  async function saveDatto() {
    setDattoSaving(true);
    setDattoMsg(null);
    const res = await fetch("/api/settings/datto", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dattoPlatform: dattoPlatform || null,
        dattoSyncEnabled,
        dattoSyncIntervalMinutes,
        dattoSiteFilter: dattoSiteFilter || null,
        ...(dattoApiKey ? { dattoApiKey } : {}),
        ...(dattoSecretKey ? { dattoSecretKey } : {}),
      }),
    });
    if (res.ok) {
      setDattoMsg({ ok: true, text: "Configuração do Datto RMM salva com sucesso." });
      setDattoApiKey("");
      setDattoSecretKey("");
      loadDatto();
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setDattoMsg({ ok: false, text: err.error ?? "Erro ao salvar." });
    }
    setDattoSaving(false);
    setTimeout(() => setDattoMsg(null), 4000);
  }

  async function syncDattoNow() {
    setDattoSyncing(true);
    setDattoMsg(null);
    const res = await fetch("/api/computers/sync", { method: "POST" });
    const data = await res.json().catch(() => ({ message: "Erro desconhecido" }));
    setDattoMsg({ ok: res.ok, text: data.message ?? (res.ok ? "Sincronização concluída." : "Erro ao sincronizar.") });
    loadDatto();
    loadDattoSites();
    setDattoSyncing(false);
    setTimeout(() => setDattoMsg(null), 6000);
  }

  async function saveRetention() {
    setSaving(true);
    setSaveMsg(null);
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusHistoryDays: retentionHistory, linkEventDays: retentionEvents }),
    });
    if (res.ok) {
      setSaveMsg({ ok: true, text: "Configuração salva com sucesso." });
      load();
    } else {
      const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
      setSaveMsg({ ok: false, text: err.error ?? "Erro ao salvar." });
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 4000);
  }

  async function runCleanup() {
    setCleaning(true);
    setCleanMsg(null);
    const res = await fetch("/api/admin/cleanup", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setCleanMsg({
        ok: true,
        text: `Limpeza concluída: ${data.deletedStatusHistory} históricos e ${data.deletedLinkEvents} eventos removidos.`,
      });
      load();
    } else {
      setCleanMsg({ ok: false, text: "Erro ao executar limpeza." });
    }
    setCleaning(false);
    setTimeout(() => setCleanMsg(null), 6000);
  }

  const totalRows = stats
    ? stats.counts.statusHistory + stats.counts.linkEvents + stats.counts.devices + stats.counts.users + stats.counts.links
    : 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Topbar
        title="Sistema"
        subtitle="Métricas do banco de dados e controle de retenção de logs"
      >
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Atualizar
        </button>
      </Topbar>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Database}
            label="Tamanho do banco"
            value={stats?.database.size ?? "—"}
            sub={stats ? formatBytes(stats.database.sizeBytes) : undefined}
            accent="blue"
          />
          <StatCard
            icon={Server}
            label="Total de registros"
            value={stats ? totalRows.toLocaleString("pt-BR") : "—"}
            sub={`${stats?.counts.statusHistory.toLocaleString("pt-BR") ?? 0} histórico de status`}
            accent="blue"
          />
          <StatCard
            icon={Activity}
            label="Worker"
            value={stats ? (stats.worker.isAlive ? "Ativo" : "Inativo") : "—"}
            sub={stats?.worker.lastSeenAt ? `Visto: ${fmtDateTime(stats.worker.lastSeenAt)}` : "Sem dados"}
            accent={stats ? (stats.worker.isAlive ? "green" : "red") : "blue"}
          />
          <StatCard
            icon={Clock}
            label="Última limpeza"
            value={stats?.retention.lastCleanupAt ? fmtDateTime(stats.retention.lastCleanupAt) : "Nunca"}
            sub={`Retenção: ${stats?.retention.statusHistoryDays ?? "—"} dias`}
            accent="amber"
          />
        </div>

        {/* Table breakdown */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold">Tabelas do banco de dados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" aria-label="Informações do sistema">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-2.5 font-semibold text-muted-foreground">Tabela</th>
                  <th className="text-right px-5 py-2.5 font-semibold text-muted-foreground">Registros (estimativa)</th>
                  <th className="text-right px-5 py-2.5 font-semibold text-muted-foreground">Tamanho total</th>
                  <th className="text-right px-5 py-2.5 font-semibold text-muted-foreground">% do banco</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      Carregando…
                    </td>
                  </tr>
                )}
                {stats?.tables.map((t) => {
                  const pct = stats.database.sizeBytes > 0
                    ? ((t.totalBytes / stats.database.sizeBytes) * 100).toFixed(1)
                    : "0.0";
                  const label = TABLE_LABELS[t.name] ?? t.name;
                  return (
                    <tr key={t.name} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium">
                        <span className="text-foreground">{label}</span>
                        <span className="text-muted-foreground ml-1.5 text-[11px]">{t.name}</span>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {t.rowEstimate.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{t.totalSize}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--accent-2)]"
                              style={{ width: `${Math.min(parseFloat(pct), 100)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-muted-foreground text-[12px] w-10 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Contagens por entidade */}
        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Dispositivos", value: stats.counts.devices },
              { label: "Links", value: stats.counts.links },
              { label: "Histórico", value: stats.counts.statusHistory },
              { label: "Eventos", value: stats.counts.linkEvents },
              { label: "Usuários", value: stats.counts.users },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-card px-4 py-3 text-center"
              >
                <div className="text-xl font-bold tabular-nums">{value.toLocaleString("pt-BR")}</div>
                <div className="text-[11px] text-muted-foreground font-semibold mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Range de histórico */}
        {stats?.statusHistoryRange.oldest && (
          <div className="rounded-xl border border-border bg-card px-5 py-4 flex flex-wrap gap-6 text-[13px]">
            <div>
              <span className="text-muted-foreground">Registro mais antigo:</span>{" "}
              <span className="font-semibold">{fmtDateTime(stats.statusHistoryRange.oldest)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Registro mais recente:</span>{" "}
              <span className="font-semibold">
                {stats.statusHistoryRange.newest ? fmtDateTime(stats.statusHistoryRange.newest) : "—"}
              </span>
            </div>
          </div>
        )}

        {/* Retention settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold">Retenção de logs</span>
          </div>
          <div className="p-5 space-y-5">
            <p className="text-[13px] text-muted-foreground">
              Registros mais antigos que o período configurado são removidos automaticamente
              pelo worker a cada 24 horas, ou manualmente pelo botão abaixo.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="hist-days" className="text-[13px]">
                  Histórico de status (StatusHistory)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hist-days"
                    type="number"
                    min={1}
                    max={365}
                    value={retentionHistory}
                    onChange={(e) => setRetentionHistory(Number(e.target.value))}
                    className="w-28 text-[13px]"
                  />
                  <span className="text-[13px] text-muted-foreground">dias</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Atualmente {stats?.counts.statusHistory.toLocaleString("pt-BR") ?? "—"} registros
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="event-days" className="text-[13px]">
                  Eventos de link (LinkEvent)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="event-days"
                    type="number"
                    min={1}
                    max={365}
                    value={retentionEvents}
                    onChange={(e) => setRetentionEvents(Number(e.target.value))}
                    className="w-28 text-[13px]"
                  />
                  <span className="text-[13px] text-muted-foreground">dias</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Atualmente {stats?.counts.linkEvents.toLocaleString("pt-BR") ?? "—"} registros
                </p>
              </div>
            </div>

            {saveMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                saveMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
              )}>
                {saveMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {saveMsg.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={saveRetention} disabled={saving} size="sm">
                {saving ? "Salvando…" : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </div>

        {/* Zoho OAuth settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold">Login corporativo Zoho</span>
            </div>
            <Switch checked={zohoEnabled} onCheckedChange={setZohoEnabled} />
          </div>
          <div className="p-5 space-y-5">
            <p className="text-[13px] text-muted-foreground">
              Permite que usuários façam login via conta corporativa Zoho (SSO).
              Pré-configure o e-mail do usuário em Usuários para liberar o acesso.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="zoho-client-id" className="text-[13px]">Client ID</Label>
                <Input
                  id="zoho-client-id"
                  placeholder="12345678.1234567890"
                  value={zohoClientId}
                  onChange={(e) => setZohoClientId(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zoho-client-secret" className="text-[13px]">
                  Client Secret
                  {hasZohoClientSecret && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurado</span>
                  )}
                </Label>
                <Input
                  id="zoho-client-secret"
                  type="password"
                  placeholder={hasZohoClientSecret ? "Deixe em branco para manter" : ""}
                  value={zohoClientSecret}
                  onChange={(e) => setZohoClientSecret(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zoho-accounts-url" className="text-[13px]">Data center (Accounts URL)</Label>
                <select
                  id="zoho-accounts-url"
                  value={zohoAccountsUrl}
                  onChange={(e) => setZohoAccountsUrl(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground text-[13px]"
                >
                  <option value="https://accounts.zoho.com">https://accounts.zoho.com (.com)</option>
                  <option value="https://accounts.zoho.eu">https://accounts.zoho.eu (.eu)</option>
                  <option value="https://accounts.zoho.in">https://accounts.zoho.in (.in)</option>
                  <option value="https://accounts.zoho.com.cn">https://accounts.zoho.com.cn (.com.cn)</option>
                  <option value="https://accounts.zoho.jp">https://accounts.zoho.jp (.jp)</option>
                  <option value="https://accounts.zoho.sa">https://accounts.zoho.sa (.sa)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/40 p-3.5 border border-border">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">Redirect URI</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-[12px] text-[var(--accent-2)] truncate">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/auth/callback/zoho` : ""}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/auth/callback/zoho`);
                    setZohoUriCopied(true);
                    setTimeout(() => setZohoUriCopied(false), 2000);
                  }}
                  aria-label="Copiar Redirect URI"
                  className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {zohoUriCopied ? "✓ Copiado para a área de transferência" : "Use este valor no Zoho API Console"}
              </p>
            </div>

            {zohoMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                zohoMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
              )}>
                {zohoMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {zohoMsg.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={saveZoho} disabled={zohoSaving} size="sm">
                {zohoSaving ? "Salvando…" : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </div>

        {/* Miradore MDM settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold">Integração Miradore MDM</span>
            </div>
            <Switch checked={miradoreSyncEnabled} onCheckedChange={setMiradoreSyncEnabled} />
          </div>
          <div className="p-5 space-y-5">
            <p className="text-[13px] text-muted-foreground">
              Sincroniza automaticamente o status técnico dos celulares (bateria, última
              conexão, S.O., compliance) a partir do Miradore MDM, sem sobrescrever os
              dados cadastrados manualmente no inventário.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="miradore-site-name" className="text-[13px]">Site name</Label>
                <Input
                  id="miradore-site-name"
                  placeholder="minha-empresa"
                  value={miradoreSiteName}
                  onChange={(e) => setMiradoreSiteName(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="miradore-api-key" className="text-[13px]">
                  API Key
                  {hasMiradoreApiKey && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurado</span>
                  )}
                </Label>
                <Input
                  id="miradore-api-key"
                  type="password"
                  placeholder={hasMiradoreApiKey ? "Deixe em branco para manter" : ""}
                  value={miradoreApiKey}
                  onChange={(e) => setMiradoreApiKey(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="miradore-interval" className="text-[13px]">Intervalo de sincronização (minutos)</Label>
                <Input
                  id="miradore-interval"
                  type="number"
                  min={5}
                  max={1440}
                  value={miradoreSyncIntervalMinutes}
                  onChange={(e) => setMiradoreSyncIntervalMinutes(Number(e.target.value))}
                  className="text-[13px]"
                />
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3.5 border border-border text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Última sincronização</span>
                <span className="font-medium">
                  {miradoreLastSyncAt ? fmtDateTime(miradoreLastSyncAt) : "Nunca"}
                </span>
              </div>
              {miradoreLastSyncError && (
                <p className="text-destructive text-[12px] pt-1">{miradoreLastSyncError}</p>
              )}
            </div>

            {miradoreMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                miradoreMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
              )}>
                {miradoreMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {miradoreMsg.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={saveMiradore} disabled={miradoreSaving} size="sm">
                {miradoreSaving ? "Salvando…" : "Salvar configuração"}
              </Button>
              <Button
                onClick={syncMiradoreNow}
                disabled={miradoreSyncing || !hasMiradoreApiKey}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", miradoreSyncing && "animate-spin")} />
                {miradoreSyncing ? "Sincronizando…" : "Sincronizar agora"}
              </Button>
            </div>
          </div>
        </div>

        {/* Datto RMM settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold">Integração Datto RMM</span>
            </div>
            <Switch checked={dattoSyncEnabled} onCheckedChange={setDattoSyncEnabled} />
          </div>
          <div className="p-5 space-y-5">
            <p className="text-[13px] text-muted-foreground">
              Sincroniza o inventário de computadores e servidores a partir do Datto RMM —
              status online/offline, última vez visto e alertas abertos aparecem em
              Computadores, sem que o WatchIT precise monitorar essas máquinas diretamente.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="datto-platform" className="text-[13px]">Plataforma / Região</Label>
                <select
                  id="datto-platform"
                  value={dattoPlatform}
                  onChange={(e) => setDattoPlatform(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground text-[13px]"
                >
                  <option value="merlot">merlot</option>
                  <option value="pinotage">pinotage</option>
                  <option value="concord">concord</option>
                  <option value="vidal">vidal</option>
                  <option value="zinfandel">zinfandel</option>
                  <option value="syrah">syrah</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="datto-interval" className="text-[13px]">Intervalo de sincronização (minutos)</Label>
                <Input
                  id="datto-interval"
                  type="number"
                  min={5}
                  max={1440}
                  value={dattoSyncIntervalMinutes}
                  onChange={(e) => setDattoSyncIntervalMinutes(Number(e.target.value))}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="datto-api-key" className="text-[13px]">
                  API Key
                  {hasDattoApiKey && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurado</span>
                  )}
                </Label>
                <Input
                  id="datto-api-key"
                  type="password"
                  placeholder={hasDattoApiKey ? "Deixe em branco para manter" : ""}
                  value={dattoApiKey}
                  onChange={(e) => setDattoApiKey(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="datto-secret-key" className="text-[13px]">
                  Secret Key
                  {hasDattoSecretKey && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurado</span>
                  )}
                </Label>
                <Input
                  id="datto-secret-key"
                  type="password"
                  placeholder={hasDattoSecretKey ? "Deixe em branco para manter" : ""}
                  value={dattoSecretKey}
                  onChange={(e) => setDattoSecretKey(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="datto-site-filter" className="text-[13px]">Site a exibir</Label>
                <select
                  id="datto-site-filter"
                  value={dattoSiteFilter}
                  onChange={(e) => setDattoSiteFilter(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground text-[13px]"
                >
                  <option value="">Todos os sites</option>
                  {dattoSites.map((site) => (
                    <option key={site} value={site}>{site}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Restringe o que aparece em Computadores e na barra lateral para todos os
                  usuários. A lista de sites é populada após a primeira sincronização.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3.5 border border-border text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Última sincronização</span>
                <span className="font-medium">
                  {dattoLastSyncAt ? fmtDateTime(dattoLastSyncAt) : "Nunca"}
                </span>
              </div>
              {dattoLastSyncError && (
                <p className="text-destructive text-[12px] pt-1">{dattoLastSyncError}</p>
              )}
            </div>

            {dattoMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                dattoMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
              )}>
                {dattoMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {dattoMsg.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={saveDatto} disabled={dattoSaving} size="sm">
                {dattoSaving ? "Salvando…" : "Salvar configuração"}
              </Button>
              <Button
                onClick={syncDattoNow}
                disabled={dattoSyncing || !hasDattoApiKey || !hasDattoSecretKey}
                variant="outline"
                size="sm"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", dattoSyncing && "animate-spin")} />
                {dattoSyncing ? "Sincronizando…" : "Sincronizar agora"}
              </Button>
            </div>
          </div>
        </div>

        {/* SMTP settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold">E-mail (SMTP)</span>
            </div>
            <Switch checked={smtpEnabled} onCheckedChange={setSmtpEnabled} />
          </div>
          <div className="p-5 space-y-5">
            <p className="text-[13px] text-muted-foreground">
              Servidor SMTP genérico (qualquer provedor, SSL ou TLS) usado para alertas
              de gravação NVR e outras notificações por e-mail do sistema.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-host" className="text-[13px]">Host</Label>
                <Input
                  id="smtp-host"
                  placeholder="smtp.exemplo.com"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port" className="text-[13px]">Porta</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  className="w-28 text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-user" className="text-[13px]">Usuário</Label>
                <Input
                  id="smtp-user"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="text-[13px]"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-password" className="text-[13px]">
                  Senha
                  {hasSmtpPassword && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurada</span>
                  )}
                </Label>
                <PasswordInput
                  id="smtp-password"
                  placeholder={hasSmtpPassword ? "Deixe em branco para manter" : ""}
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-from" className="text-[13px]">Remetente (From)</Label>
                <Input
                  id="smtp-from"
                  placeholder="watchit@exemplo.com"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  className="text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-email-to" className="text-[13px]">Destinatário(s) de alerta</Label>
                <Input
                  id="alert-email-to"
                  placeholder="ti@exemplo.com, ti2@exemplo.com"
                  value={alertEmailTo}
                  onChange={(e) => setAlertEmailTo(e.target.value)}
                  className="text-[13px]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
              <Label className="text-[13px]">TLS implícito (porta 465) — desligado usa STARTTLS (587)</Label>
            </div>

            {smtpMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                smtpMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
              )}>
                {smtpMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {smtpMsg.text}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button onClick={saveSmtp} disabled={smtpSaving} size="sm">
                {smtpSaving ? "Salvando…" : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </div>

        {/* Manual cleanup */}
        <div className="rounded-xl border border-destructive/30 bg-card">
          <div className="px-5 py-3.5 border-b border-destructive/30 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="text-[13px] font-semibold">Limpeza manual</span>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-[13px] text-muted-foreground">
              Remove imediatamente todos os registros além do período de retenção configurado.
              Esta operação é irreversível.
            </p>

            {cleanMsg && (
              <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
                cleanMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
              )}>
                {cleanMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {cleanMsg.text}
              </div>
            )}

            <Button
              variant="destructive"
              size="sm"
              onClick={runCleanup}
              disabled={cleaning}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {cleaning ? "Limpando…" : "Executar limpeza agora"}
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 grid gap-4 max-w-3xl">
        <AppearanceCard />
        <ModulesCard />
        <CliqCard />
        <TicketCard />
      </div>
    </div>
  );
}
