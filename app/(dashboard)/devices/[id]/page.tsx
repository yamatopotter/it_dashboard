"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { MetricsChart } from "@/components/metrics-chart";
import { PingChart } from "@/components/ping-chart";
import { Panel } from "@/components/tui/panel";
import { DevEmpty, DevLoading, DevPage } from "@/components/tui/dev-shell";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { formatUptime, formatResponseTime, formatPercent, fmtDateTime, formatBps, formatBytes } from "@/lib/format";
import { pctLevel } from "@/lib/tui-format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { Device, DeviceStatus, StatusHistory, NvrChannelIssue } from "@prisma/client";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";

interface UnifiSSID {
  ssid: string;
  band: string;
  channel: number;
  clients: number;
  txBytes: number;
  rxBytes: number;
}

interface UnifiClient {
  id: string;
  name: string;
  mac: string;
  ip: string | null;
  connectedAt: string | null;
  signal: number | null;
  ssid: string | null;
}

interface UnifiData {
  model: string | null;
  firmware: string | null;
  uptime: number | null;
  cpuLoad: number | null;
  memoryUsed: number | null;
  uplinkTxBps: number | null;
  uplinkRxBps: number | null;
  totalClients: number;
  ssids: UnifiSSID[];
  clients: UnifiClient[];
}

interface OmadaSSID {
  ssid: string;
  band: string;
  channel: string | null;
  clients: number;
}

interface OmadaClient {
  id: string;
  name: string;
  mac: string;
  ip: string | null;
  signal: number | null;
  snr: number | null;
  ssid: string | null;
  band: string | null;
  wifiMode: number | null;
  uptime: number | null;
}

interface RouterOSClient {
  mac: string;
  ip: string;
  hostname: string | null;
  server: string | null;
}

interface RouterOSData {
  clients: RouterOSClient[];
}

interface OmadaData {
  model: string | null;
  firmware: string | null;
  uptime: number | null;
  cpuLoad: number | null;
  memoryUsed: number | null;
  uplinkTxBps: number | null;
  uplinkRxBps: number | null;
  totalClients: number;
  ssids: OmadaSSID[];
  clients: OmadaClient[];
}

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

const HOUR_OPTIONS = [
  { label: "1h",  value: 1   },
  { label: "6h",  value: 6   },
  { label: "24h", value: 24  },
  { label: "7d",  value: 168 },
] as const;
type HourOption = typeof HOUR_OPTIONS[number]["value"];

type ClientSortKey = "name" | "ip" | "connectedAt" | "signal" | "band" | "uptime";

const HELP: HelpRow[] = [
  ["r", "verificar agora"],
  ["e", "editar o dispositivo"],
  ["h", "alternar o período do gráfico (1h → 6h → 24h → 7d)"],
  ["esc / b", "voltar para a lista"],
  ["?", "esta ajuda"],
];

const HINTS: KeyHint[] = [
  { keys: ["r"], label: "verificar" },
  { keys: ["e"], label: "editar" },
  { keys: ["h"], label: "período", hideSm: true },
  { keys: ["b"], label: "voltar" },
  { keys: ["?"], label: "ajuda" },
];

// Escopo de módulo (não é redefinido a cada render — evita remontar os botões do cabeçalho)
function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}>
      {label}{active ? " ↓" : ""}
    </button>
  );
}

function Tile({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="d-tile">
      <div className="k">{label}</div>
      <div className={`v ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

function Usage({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="faint">—</span>;
  const lvl = pctLevel(pct);
  return (
    <span className="barwrap">
      <span
        className={`bar${lvl === "crit" ? " c" : lvl === "warn" ? " w" : ""}`}
        style={{ "--p": Math.round(pct), width: "8ch" } as React.CSSProperties}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Uso"
      >
        <i />
      </span>
      <span className={lvl}>{formatPercent(pct)}</span>
    </span>
  );
}

function Alert({ tone, title, children }: { tone: "crit" | "warn"; title: string; children?: React.ReactNode }) {
  return (
    <div className={`d-note ${tone === "crit" ? "crit" : ""}`} role={tone === "crit" ? "alert" : "status"}>
      <div className={tone}>{tone === "crit" ? "✖" : "▲"} {title}</div>
      {children ? <div className="dim" style={{ overflowWrap: "anywhere" }}>{children}</div> : null}
    </div>
  );
}

export default function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [device, setDevice] = useState<DeviceWithStatus | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState<HourOption>(24);
  const [isChecking, setIsChecking] = useState(false);
  const [clientsExpanded, setClientsExpanded] = useState(false);
  const [dhcpExpanded, setDhcpExpanded] = useState(false);
  const [clientSort, setClientSort] = useState<ClientSortKey>("signal");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [nvrIssues, setNvrIssues] = useState<NvrChannelIssue[]>([]);
  const [linkedCameras, setLinkedCameras] = useState<Device[]>([]);
  const [parentNvr, setParentNvr] = useState<Device | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [help, setHelp] = useState(false);

  const load = useCallback(async (h: number, signal?: AbortSignal) => {
    try {
      const [devRes, histRes] = await Promise.all([
        fetch(`/api/devices/${id}`, { cache: "no-store", signal }),
        fetch(`/api/status/${id}?hours=${h}`, { cache: "no-store", signal }),
      ]);
      if (devRes.ok) setDevice(await devRes.json());
      if (histRes.ok) setHistory(await histRes.json());
      if (devRes.ok) setLastUpdated(new Date());
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      console.error("[device-detail] falha ao carregar dados:", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    load(hours, controller.signal);
    return () => controller.abort();
  }, [hours, load]);

  useEffect(() => {
    const interval = setInterval(() => load(hours), 30_000);
    return () => clearInterval(interval);
  }, [id, hours, load]);

  // Canais de gravação NVR (type = DVR) — issues abertas + câmeras vinculadas a este NVR
  useEffect(() => {
    if (!device || device.type !== "DVR") return;
    const controller = new AbortController();
    const loadNvr = () => {
      Promise.all([
        fetch(`/api/devices/${id}/nvr-issues?limit=100`, { cache: "no-store", signal: controller.signal })
          .then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/devices?type=CAMERA`, { cache: "no-store", signal: controller.signal })
          .then((r) => (r.ok ? r.json() : [])),
      ]).then(([issuesRes, cameras]: [{ data: NvrChannelIssue[] } | null, Array<Device & { parentNvrId?: string | null }>]) => {
        if (issuesRes) setNvrIssues(issuesRes.data.filter((i) => i.resolvedAt == null));
        setLinkedCameras(cameras.filter((c) => c.parentNvrId === id));
      }).catch(() => {});
    };
    loadNvr();
    const interval = setInterval(loadNvr, 30_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [device, id]);

  // Vínculo de câmera → NVR: busca o nome do NVR pai para exibição
  useEffect(() => {
    const parentId = (device as (Device & { parentNvrId?: string | null }) | null)?.parentNvrId;
    if (!device || device.type !== "CAMERA" || !parentId) { setParentNvr(null); return; }
    fetch(`/api/devices/${parentId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setParentNvr)
      .catch(() => setParentNvr(null));
  }, [device]);

  const handleCheck = useCallback(async () => {
    setIsChecking(true);
    await fetch(`/api/devices/${id}/check`, { method: "POST" }).catch(() => {});
    await load(hours);
    setIsChecking(false);
  }, [id, hours, load]);

  async function handleDelete() {
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Dispositivo removido");
      router.push("/devices");
    } else {
      toast.error("Erro ao remover dispositivo");
    }
  }

  const hotkeys = useMemo(() => ({
    r: () => { void handleCheck(); },
    e: () => router.push(`/devices/${id}/edit`),
    h: () => setHours((cur) => {
      const i = HOUR_OPTIONS.findIndex((o) => o.value === cur);
      return HOUR_OPTIONS[(i + 1) % HOUR_OPTIONS.length].value;
    }),
    b: () => router.push("/devices"),
    "?": () => setHelp((v) => !v),
    Escape: () => { if (help) setHelp(false); else router.push("/devices"); },
  }), [handleCheck, router, id, help]);
  useHotkeys(hotkeys);

  if (loading && !device) {
    return (
      <DevPage title="Carregando…" back="/devices" backLabel="dispositivos">
        <Panel title="dispositivo" color="info"><DevLoading rows={6} /></Panel>
      </DevPage>
    );
  }

  if (!device) {
    return (
      <DevPage title="Dispositivo" back="/devices" backLabel="dispositivos">
        <Panel title="erro" color="crit" hot><DevEmpty title="Dispositivo não encontrado." /></Panel>
      </DevPage>
    );
  }

  const status = device.currentStatus;
  const hasSystemMetrics = device.snmpEnabled || device.routerosEnabled || device.unifiEnabled || (device as Device & { omadaEnabled?: boolean }).omadaEnabled;
  const unifiData = (status?.unifiData ?? null) as UnifiData | null;
  const unifiError = device.unifiEnabled ? (status?.unifiError ?? null) : null;
  const isInformApi = (device as Device & { unifiAuthMethod?: string }).unifiAuthMethod === "userpass";
  const omadaData = ((status as (typeof status & { omadaData?: unknown }))?.omadaData ?? null) as OmadaData | null;
  const omadaError = (device as Device & { omadaEnabled?: boolean }).omadaEnabled ? ((status as (typeof status & { omadaError?: string }))?.omadaError ?? null) : null;
  const routerosData = device.routerosEnabled
    ? (((status as (typeof status & { routerosData?: unknown }))?.routerosData ?? null) as RouterOSData | null)
    : null;

  // Lista de clientes ordenada (UniFi ou Omada)
  const activeClients = unifiData?.clients ?? omadaData?.clients ?? [];
  const sortedClients = [...activeClients].sort((a, b) => {
    if (clientSort === "name") return a.name.localeCompare(b.name);
    if (clientSort === "ip") return (a.ip ?? "").localeCompare(b.ip ?? "");
    if (clientSort === "band") return ((a as OmadaClient).band ?? "").localeCompare((b as OmadaClient).band ?? "");
    if (clientSort === "uptime") return ((b as OmadaClient).uptime ?? 0) - ((a as OmadaClient).uptime ?? 0);
    if (clientSort === "connectedAt") return new Date((b as UnifiClient).connectedAt ?? 0).getTime() - new Date((a as UnifiClient).connectedAt ?? 0).getTime();
    return (b.signal ?? -200) - (a.signal ?? -200); // sinal mais forte primeiro (padrão)
  });

  const reversedHistory = [...history].reverse();
  const historyVisible = historyExpanded ? reversedHistory : reversedHistory.slice(0, 20);
  const apData = unifiData ?? omadaData;
  const weakClients = [...(unifiData?.clients ?? []), ...(omadaData?.clients ?? [])].filter((c) => c.signal != null && c.signal < -80);
  const cpu = status?.cpuLoad ?? unifiData?.cpuLoad ?? null;
  const mem = status?.memoryUsed ?? unifiData?.memoryUsed ?? null;
  const protocols = [
    device.pingEnabled && "Ping",
    device.httpEnabled && `HTTP :${device.httpPort ?? 80}`,
    device.snmpEnabled && "SNMP",
    device.routerosEnabled && "RouterOS API",
    device.unifiEnabled && (unifiError ? "UniFi API ✖" : "UniFi API"),
    (device as Device & { omadaEnabled?: boolean }).omadaEnabled && (omadaError ? "Omada API ✖" : "Omada API"),
    device.nvrEnabled && "Monitor NVR",
  ].filter(Boolean) as string[];

  const actions = (
    <>
      <Link href={`/reports?device=${id}`} className="btn">relatório</Link>
      <button type="button" className="btn" onClick={handleCheck} disabled={isChecking}>
        <kbd>r</kbd> {isChecking ? "verificando…" : "verificar agora"}
      </button>
      <Link href={`/devices/${id}/edit`} className="btn"><kbd>e</kbd> editar</Link>
      <AlertDialog>
        <AlertDialogTrigger render={<button type="button" className="btn danger">remover</button>} />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover dispositivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Todo o histórico de monitoramento será apagado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return (
    <DevPage
      title={device.name}
      sub={
        <>
          <StatusBadge isOnline={status?.isOnline ?? false} acknowledged={!status?.isOnline && !!device.offlineAcknowledgedAt} />{" "}
          {device.ip}{device.location ? ` · ${device.location}` : ""}
        </>
      }
      back="/devices"
      backLabel="dispositivos"
      live
      lastUpdated={lastUpdated}
      actions={actions}
      hints={HINTS}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      <div className="d-stack">
        {/* Alertas: cada um com glifo + texto */}
        {unifiError && <Alert tone="crit" title="Falha na conexão com o controlador UniFi">{unifiError}</Alert>}
        {omadaError && <Alert tone="crit" title="Falha na conexão com o controlador Omada">{omadaError}</Alert>}
        {weakClients.length > 0 && (
          <Alert tone="warn" title={`${weakClients.length} cliente${weakClients.length !== 1 ? "s" : ""} com sinal fraco`}>
            {weakClients.map((c) => `${c.name} (${c.signal} dBm)`).join(", ")}
          </Alert>
        )}

        <Panel title="estado" sub={protocols.join(" · ") || undefined} color={status?.isOnline ? "ok" : "crit"} hot={!status?.isOnline && !device.offlineAcknowledgedAt}>
          <div className="d-tiles">
            <Tile label="ping" value={formatResponseTime(status?.pingMs)} />
            <Tile label="uptime" value={status?.uptime != null ? formatUptime(status.uptime) : unifiData?.uptime != null ? formatUptime(unifiData.uptime) : "—"} />
            <div className="d-tile"><div className="k">cpu</div><div className="v" style={{ fontSize: 13 }}><Usage pct={cpu} /></div></div>
            <div className="d-tile"><div className="k">memória</div><div className="v" style={{ fontSize: 13 }}><Usage pct={mem} /></div></div>
            {apData && <Tile label="downlink" value={formatBps(apData.uplinkRxBps)} />}
            {apData && <Tile label="uplink" value={formatBps(apData.uplinkTxBps)} />}
            {apData && <Tile label="clientes" value={String(apData.totalClients)} />}
            {status?.httpOk != null && <Tile label="http" value={status.httpOk ? "● OK" : "✖ Falha"} cls={status.httpOk ? "ok" : "crit"} />}
          </div>
          {(apData?.model || apData?.firmware || (device.type === "CAMERA" && parentNvr)) && (
            <div className="dim" style={{ marginTop: 8 }}>
              {apData?.model && <span>modelo {apData.model} </span>}
              {apData?.firmware && <span>· fw {apData.firmware} </span>}
              {device.type === "CAMERA" && parentNvr && (
                <span>
                  Vinculada ao canal {(device as Device & { parentNvrChannel?: number | null }).parentNvrChannel} de{" "}
                  <Link href={`/devices/${parentNvr.id}`} style={{ color: "var(--info)" }}>{parentNvr.name}</Link>
                </span>
              )}
            </div>
          )}
        </Panel>

        {/* Monitor NVR: canais de gravação + saúde de disco */}
        {device.type === "DVR" && device.nvrEnabled && (
          <Panel
            title="canais de gravação"
            sub={status?.nvrChannelsTotal != null ? `${status.nvrChannelsOk ?? 0}/${status.nvrChannelsTotal} ok` : undefined}
            color={nvrIssues.length > 0 ? "warn" : "ok"}
          >
            <div className="d-stack" style={{ gap: 10, paddingBottom: 0 }}>
              {status?.nvrDiskError && <Alert tone="crit" title="Saúde de disco indisponível">{status.nvrDiskError}</Alert>}

              {!!status?.nvrDiskData && typeof status.nvrDiskData === "object" && (
                <div>
                  <div className="dim" style={{ marginBottom: 4 }}>armazenamento (dados brutos do NVR)</div>
                  <dl className="kv" style={{ gridTemplateColumns: "minmax(10ch, 24ch) 1fr" }}>
                    {Object.entries(status.nvrDiskData as Record<string, string>).slice(0, 12).map(([k, v]) => (
                      <div key={k} style={{ display: "contents" }}>
                        <dt>{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {nvrIssues.length === 0 ? (
                <div className="dim"><span className="ok">●</span> nenhum problema em aberto nos canais.</div>
              ) : (
                <div className="d-wrap">
                  <table className="d-tbl static" aria-label="Canais com problema de gravação">
                    <thead>
                      <tr><th>Canal</th><th>Problema</th><th>Detalhe</th><th>Detectado em</th><th>Câmera vinculada</th></tr>
                    </thead>
                    <tbody>
                      {nvrIssues.map((issue) => {
                        const camera = linkedCameras.find(
                          (c) => (c as Device & { parentNvrChannel?: number | null }).parentNvrChannel === issue.channel
                        );
                        const severe = issue.issueType === "not_recording_now" || issue.issueType === "no_recordings" || issue.issueType === "unreachable";
                        return (
                          <tr key={issue.id}>
                            <td className="name">{issue.channel} · {issue.channelName}</td>
                            <td className={severe ? "crit" : "warn"}>{severe ? "✖" : "▲"} {issue.issueType}</td>
                            <td className="dim" title={issue.detail}>{issue.detail}</td>
                            <td className="dim">{fmtDateTime(issue.detectedAt)}</td>
                            <td>
                              {camera ? <Link href={`/devices/${camera.id}`} style={{ color: "var(--info)" }}>{camera.name}</Link> : <span className="faint">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Gráficos */}
        <Panel
          title="métricas"
          sub={hours === 168 ? "7d" : `${hours}h`}
          color="info"
          right={
            <span className="d-seg" role="group" aria-label="Período">
              {HOUR_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" aria-pressed={hours === opt.value} onClick={() => setHours(opt.value)}>
                  {opt.label}
                </button>
              ))}
            </span>
          }
        >
          <div className="d-stack" style={{ paddingBottom: 0 }}>
            <div>
              <div className="dim" style={{ marginBottom: 4 }}>latência (ms)</div>
              {loading ? (
                <DevLoading rows={4} />
              ) : history.length >= 2 ? (
                <PingChart history={history} />
              ) : (
                <DevEmpty title="Sem dados para o período" />
              )}
            </div>
            {hasSystemMetrics && history.length > 0 && (
              <div className="d-cols">
                <MetricsChart history={history} metric="cpuLoad" label="CPU (%)" color="var(--warning)" unit="%" />
                <MetricsChart history={history} metric="memoryUsed" label="Memória (%)" color="var(--chart-4)" unit="%" />
              </div>
            )}
          </div>
        </Panel>

        {/* SSIDs (UniFi ou Omada) */}
        {apData && apData.ssids.length > 0 && (() => {
          const showExtended = isInformApi && unifiData != null;
          return (
            <Panel title="redes wi-fi" sub={`${apData.ssids.length}`} color="accent2">
              <div className="d-wrap">
                <table className="d-tbl static" aria-label="Redes Wi-Fi">
                  <thead>
                    <tr>
                      <th>SSID</th><th>Banda</th><th>Canal</th><th className="r">Clientes</th>
                      {showExtended && <th className="r">RX total</th>}
                      {showExtended && <th className="r">TX total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {apData.ssids.map((s, i) => (
                      <tr key={i}>
                        <td className="name">{s.ssid}</td>
                        <td><span className="d-tag">{s.band}</span></td>
                        <td className="dim">
                          {omadaData
                            ? ((s as OmadaSSID).channel ?? "—")
                            : ((s as UnifiSSID).channel > 0 ? `ch ${(s as UnifiSSID).channel}` : "—")}
                        </td>
                        <td className="r">{s.clients}</td>
                        {showExtended && <td className="r dim">{formatBytes((s as UnifiSSID).rxBytes)}</td>}
                        {showExtended && <td className="r dim">{formatBytes((s as UnifiSSID).txBytes)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })()}

        {/* Clientes Wi-Fi (recolhível) */}
        {activeClients.length > 0 && (
          <Panel title="clientes conectados" sub={`${activeClients.length}`} color="accent2">
            <button type="button" className="d-toggle" onClick={() => setClientsExpanded((v) => !v)} aria-expanded={clientsExpanded}>
              {clientsExpanded ? "▾ ocultar clientes" : "▸ mostrar clientes"}
            </button>
            {clientsExpanded && (
              <div className="d-wrap" style={{ marginTop: 8 }}>
                <table className="d-tbl static" aria-label="Clientes Wi-Fi conectados">
                  <thead>
                    <tr>
                      <th><SortButton label="Nome / MAC" active={clientSort === "name"} onClick={() => setClientSort("name")} /></th>
                      <th><SortButton label="IP" active={clientSort === "ip"} onClick={() => setClientSort("ip")} /></th>
                      {(isInformApi || omadaData) && <th><SortButton label="Sinal" active={clientSort === "signal"} onClick={() => setClientSort("signal")} /></th>}
                      {(isInformApi || omadaData) && <th>SSID</th>}
                      {omadaData && <th><SortButton label="Banda" active={clientSort === "band"} onClick={() => setClientSort("band")} /></th>}
                      {omadaData && <th>Wi-Fi</th>}
                      {omadaData && <th><SortButton label="Conectado há" active={clientSort === "uptime"} onClick={() => setClientSort("uptime")} /></th>}
                      {isInformApi && <th><SortButton label="Conectado em" active={clientSort === "connectedAt"} onClick={() => setClientSort("connectedAt")} /></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClients.map((c) => (
                      <tr key={c.id}>
                        <td className="name" title={c.name}>{c.name}</td>
                        <td className="dim">{c.ip ?? "—"}</td>
                        {(isInformApi || omadaData) && (
                          <td>{c.signal != null ? <SignalCell dbm={c.signal} snr={omadaData ? (c as OmadaClient).snr : null} /> : "—"}</td>
                        )}
                        {(isInformApi || omadaData) && <td className="dim">{c.ssid ?? "—"}</td>}
                        {omadaData && <td className="dim">{(c as OmadaClient).band ?? "—"}</td>}
                        {omadaData && <td className="dim">{wifiGenLabel((c as OmadaClient).wifiMode)}</td>}
                        {omadaData && <td className="dim">{formatUptime((c as OmadaClient).uptime)}</td>}
                        {isInformApi && <td className="dim">{(c as UnifiClient).connectedAt ? fmtDateTime((c as UnifiClient).connectedAt!) : "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {/* Clientes DHCP (RouterOS) */}
        {device.routerosEnabled && (
          <Panel title="clientes dhcp" sub={routerosData !== null ? `${routerosData.clients.length}` : undefined} color="accent2">
            <button type="button" className="d-toggle" onClick={() => setDhcpExpanded((v) => !v)} aria-expanded={dhcpExpanded}>
              {dhcpExpanded ? "▾ ocultar clientes" : "▸ mostrar clientes"}
            </button>
            {dhcpExpanded && (
              <div className="d-wrap" style={{ marginTop: 8 }}>
                {routerosData === null ? (
                  <div className="dim">◌ aguardando primeira coleta…</div>
                ) : routerosData.clients.length === 0 ? (
                  <div className="dim">░ nenhum cliente DHCP ativo.</div>
                ) : (
                  <table className="d-tbl static" aria-label="Clientes DHCP ativos">
                    <thead><tr><th>Hostname</th><th>IP</th><th>MAC</th><th>Servidor</th></tr></thead>
                    <tbody>
                      {routerosData.clients.map((c) => (
                        <tr key={c.mac}>
                          <td className="name">{c.hostname ?? <span className="dim">sem nome</span>}</td>
                          <td className="dim">{c.ip || "—"}</td>
                          <td className="dim">{c.mac}</td>
                          <td className="dim">{c.server ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Panel>
        )}

        {/* Histórico recente — 20 itens, expansível */}
        {history.length > 0 && (
          <Panel title="histórico recente" sub={`${historyVisible.length}/${reversedHistory.length}`} color="dim">
            <div className="d-wrap">
              <table className="d-tbl static" aria-label="Histórico de status do dispositivo">
                <thead>
                  <tr>
                    <th>Data/Hora</th><th>Status</th><th>Ping</th>
                    {hasSystemMetrics && (<><th>CPU</th><th>Memória</th></>)}
                  </tr>
                </thead>
                <tbody>
                  {historyVisible.map((h) => (
                    <tr key={h.id}>
                      <td className="dim">{fmtDateTime(h.timestamp)}</td>
                      <td><StatusBadge isOnline={h.isOnline} /></td>
                      <td>{formatResponseTime(h.pingMs)}</td>
                      {hasSystemMetrics && (<><td>{formatPercent(h.cpuLoad)}</td><td>{formatPercent(h.memoryUsed)}</td></>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reversedHistory.length > 20 && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button type="button" className="btn" onClick={() => setHistoryExpanded((v) => !v)} aria-expanded={historyExpanded}>
                  {historyExpanded ? "mostrar menos" : `ver todos os ${reversedHistory.length} registros`}
                </button>
              </div>
            )}
          </Panel>
        )}

        {device.notes && (
          <Panel title="observações" color="dim">
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{device.notes}</p>
          </Panel>
        )}
      </div>
    </DevPage>
  );
}

function SignalCell({ dbm, snr }: { dbm: number; snr?: number | null }) {
  const cls = dbm >= -60 ? "ok" : dbm >= -75 ? "warn" : "crit";
  const glyph = dbm >= -60 ? "●" : dbm >= -75 ? "▲" : "✖";
  return (
    <span>
      <span className={cls}>{glyph} {dbm} dBm</span>
      {snr != null && <span className="dim"> · SNR {snr} dB</span>}
    </span>
  );
}

function wifiGenLabel(mode: number | null): string {
  if (mode == null) return "—";
  if (mode >= 4 && mode <= 7) return `Wi-Fi ${mode}`;
  return "—";
}
