"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Panel } from "@/components/tui/panel";
import { DevEmpty, DevError, DevLoading, DevPage } from "@/components/tui/dev-shell";
import { DevTable, KpiStrip, NetAlert, PanelToggle, SignalCell, UsageBar, useDeviceList, type Col } from "@/components/dev-net-panels";
import { formatUptime, formatBps, timeAgo } from "@/lib/format";

// ── Tipos ──────────────────────────────────────────────────────────────────────

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

interface DeviceStatus {
  isOnline: boolean;
  pingMs: number | null;
  omadaData: OmadaData | null;
  omadaError: string | null;
  checkedAt: string;
}

interface OmadaDevice {
  id: string;
  name: string;
  ip: string;
  location: string | null;
  currentStatus: DeviceStatus | null;
}

type ClientSortKey = "name" | "signal" | "band" | "uptime";

function wifiGenLabel(mode: number | null): string {
  if (mode != null && mode >= 4 && mode <= 7) return `Wi-Fi ${mode}`;
  return "—";
}

const SSID_COLS: Col<OmadaSSID>[] = [
  { key: "ssid", head: "SSID", cell: (s) => s.ssid, className: "name" },
  { key: "band", head: "Banda", cell: (s) => <span className="d-tag">{s.band}</span> },
  { key: "ch", head: "Canal", cell: (s) => s.channel ?? "—", className: "dim" },
  { key: "cl", head: "Clientes", cell: (s) => s.clients, right: true },
];

// ── Painel de um AP ───────────────────────────────────────────────────────────

function APPanel({ device }: { device: OmadaDevice }) {
  const status   = device.currentStatus;
  const data     = status?.omadaData ?? null;
  const error    = status?.omadaError ?? null;
  const isOnline = status?.isOnline ?? false;

  const weakClients = (data?.clients ?? []).filter((c) => c.signal != null && c.signal < -80);
  const hasCpuAlert = (data?.cpuLoad ?? 0) > 80;
  const hasMemAlert = (data?.memoryUsed ?? 0) > 85;

  const [clientsOpen, setClientsOpen] = useState(!isOnline && (data?.clients.length ?? 0) > 0);
  const [ssidsOpen, setSsidsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<ClientSortKey>("signal");

  const sortedClients = [...(data?.clients ?? [])].sort((a, b) => {
    if (sortKey === "name")   return a.name.localeCompare(b.name);
    if (sortKey === "band")   return (a.band ?? "").localeCompare(b.band ?? "");
    if (sortKey === "uptime") return (b.uptime ?? 0) - (a.uptime ?? 0);
    return (b.signal ?? -200) - (a.signal ?? -200);
  });

  const clientCols: Col<OmadaClient>[] = [
    { key: "name", head: "Nome / MAC", onSort: () => setSortKey("name"), sorted: sortKey === "name", className: "name",
      cell: (c) => <span title={`${c.name} · ${c.mac}`}>{c.name} <span className="dim" style={{ fontWeight: 400 }}>{c.mac}</span></span> },
    { key: "ip", head: "IP", cell: (c) => c.ip ?? "—", className: "dim" },
    { key: "sig", head: "Sinal", onSort: () => setSortKey("signal"), sorted: sortKey === "signal", cell: (c) => <SignalCell signal={c.signal} snr={c.snr} /> },
    { key: "ssid", head: "SSID", cell: (c) => c.ssid ?? "—", className: "dim", hideSm: true },
    { key: "band", head: "Banda", onSort: () => setSortKey("band"), sorted: sortKey === "band", cell: (c) => c.band ?? "—", className: "dim", hideSm: true },
    { key: "wifi", head: "Wi-Fi", cell: (c) => wifiGenLabel(c.wifiMode), className: "dim", hideSm: true },
    { key: "up", head: "Conectado há", onSort: () => setSortKey("uptime"), sorted: sortKey === "uptime", cell: (c) => formatUptime(c.uptime), className: "dim", hideSm: true },
  ];

  return (
    <Panel
      title={device.name}
      sub={`${device.ip}${device.location ? ` · ${device.location}` : ""}${data?.model ? ` · ${data.model}` : ""}${data?.firmware ? ` · fw ${data.firmware}` : ""}`}
      color={isOnline ? "ok" : "crit"}
      hot={!isOnline}
      right={<Link href={`/devices/${device.id}`} style={{ color: "inherit" }}>detalhes ›</Link>}
    >
      <div className="d-stack" style={{ gap: 10, paddingBottom: 0 }}>
        <div className="d-line">
          <StatusBadge isOnline={isOnline} />
          {status?.checkedAt && <span className="dim">verificado {timeAgo(status.checkedAt)}</span>}
        </div>

        {error && <NetAlert tone="crit">{error}</NetAlert>}
        {(hasCpuAlert || hasMemAlert) && (
          <NetAlert tone="crit">
            {[
              hasCpuAlert && `CPU em ${data!.cpuLoad!.toFixed(0)}% — acima do limite`,
              hasMemAlert && `Memória em ${data!.memoryUsed!.toFixed(0)}% — risco de instabilidade`,
            ].filter(Boolean).join(" · ")}
          </NetAlert>
        )}
        {weakClients.length > 0 && (
          <NetAlert tone="warn">
            {weakClients.length} cliente{weakClients.length !== 1 ? "s" : ""} com sinal fraco (&lt; -80 dBm):{" "}
            {weakClients.map((c) => `${c.name} (${c.signal} dBm)`).join(", ")}
          </NetAlert>
        )}

        {data && (
          <div className="d-tiles">
            <div className="d-tile"><div className="k">clientes</div><div className="v">{data.totalClients}</div></div>
            <div className="d-tile"><div className="k">↓ downlink</div><div className="v" style={{ fontSize: 14 }}>{formatBps(data.uplinkRxBps)}</div></div>
            <div className="d-tile"><div className="k">↑ uplink</div><div className="v" style={{ fontSize: 14 }}>{formatBps(data.uplinkTxBps)}</div></div>
            {data.cpuLoad != null && <div className="d-tile"><div className="k">cpu</div><div className="v" style={{ fontSize: 13 }}><UsageBar value={data.cpuLoad} label={`CPU de ${device.name}`} width="6ch" /></div></div>}
            {data.memoryUsed != null && <div className="d-tile"><div className="k">memória</div><div className="v" style={{ fontSize: 13 }}><UsageBar value={data.memoryUsed} label={`Memória de ${device.name}`} width="6ch" /></div></div>}
            {data.uptime != null && <div className="d-tile"><div className="k">uptime</div><div className="v" style={{ fontSize: 14 }}>{formatUptime(data.uptime)}</div></div>}
          </div>
        )}

        {data && data.ssids.length > 0 && (
          <PanelToggle open={ssidsOpen} onToggle={() => setSsidsOpen((v) => !v)} label="Redes Wi-Fi" count={data.ssids.length}>
            <DevTable label="Redes Wi-Fi (SSIDs)" cols={SSID_COLS} rows={data.ssids} rowKey={(s, i) => `${s.ssid}-${s.band}-${i}`} />
          </PanelToggle>
        )}

        {data && data.clients.length > 0 && (
          <PanelToggle open={clientsOpen} onToggle={() => setClientsOpen((v) => !v)} label="Clientes conectados" count={data.clients.length}>
            <DevTable label="Clientes Omada conectados" cols={clientCols} rows={sortedClients} rowKey={(c) => c.id} />
          </PanelToggle>
        )}

        {!data && !error && <div className="dim">◌ aguardando primeira coleta…</div>}
      </div>
    </Panel>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function OmadaPage() {
  const { devices, loading, error, lastUpdated, isChecking, checkAll, reload } = useDeviceList<OmadaDevice>("OMADA_AP");

  const online       = devices.filter((d) => d.currentStatus?.isOnline).length;
  const offline      = devices.length - online;
  const withData     = devices.filter((d) => d.currentStatus?.omadaData);
  const totalClients = withData.reduce((s, d) => s + (d.currentStatus?.omadaData?.totalClients ?? 0), 0);
  const avgCpu = withData.length
    ? withData.reduce((s, d) => s + (d.currentStatus?.omadaData?.cpuLoad ?? 0), 0) / withData.length
    : null;
  const avgMem = withData.length
    ? withData.reduce((s, d) => s + (d.currentStatus?.omadaData?.memoryUsed ?? 0), 0) / withData.length
    : null;

  const sorted = [...devices].sort((a, b) => {
    const aOn = a.currentStatus?.isOnline ?? false;
    const bOn = b.currentStatus?.isOnline ?? false;
    if (aOn !== bOn) return aOn ? 1 : -1; // offline primeiro
    return a.name.localeCompare(b.name);
  });

  return (
    <DevPage
      title="Painel Omada"
      sub={loading ? "carregando…" : `${devices.length} AP${devices.length !== 1 ? "s" : ""} registrado${devices.length !== 1 ? "s" : ""}`}
      live={!loading && !error}
      lastUpdated={lastUpdated}
      actions={
        <button type="button" className="btn" onClick={checkAll} disabled={isChecking}>
          {isChecking ? "verificando…" : "atualizar todos"}
        </button>
      }
    >
      <div className="d-stack">
        <KpiStrip
          items={[
            { label: "Online", value: `${online}/${devices.length}`, sub: "APs ativos", tone: offline > 0 ? "warn" : "ok" },
            { label: "Clientes", value: String(totalClients), sub: "em todos os APs" },
            { label: "CPU média", value: avgCpu != null ? `${avgCpu.toFixed(0)}%` : "—", sub: "APs com dados", tone: avgCpu == null ? "dim" : avgCpu > 70 ? "crit" : avgCpu > 40 ? "warn" : "ok" },
            { label: "Mem média", value: avgMem != null ? `${avgMem.toFixed(0)}%` : "—", sub: "APs com dados", tone: avgMem == null ? "dim" : avgMem > 85 ? "crit" : avgMem > 60 ? "warn" : "ok" },
          ]}
        />

        {loading ? (
          <Panel title="aps" color="info"><DevLoading rows={5} label="Carregando APs" /></Panel>
        ) : error && devices.length === 0 ? (
          <DevError message="Não foi possível carregar os APs Omada." onRetry={() => void reload()} />
        ) : devices.length === 0 ? (
          <Panel title="aps" color="info">
            <DevEmpty
              title="Nenhum AP Omada registrado"
              hint="Adicione um dispositivo do tipo Omada AP para visualizar o painel."
              action={<Link href="/devices/new" className="btn pri">+ novo dispositivo</Link>}
            />
          </Panel>
        ) : (
          sorted.map((d) => <APPanel key={d.id} device={d} />)
        )}
      </div>
    </DevPage>
  );
}
