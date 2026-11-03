"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Panel } from "@/components/tui/panel";
import { DevEmpty, DevError, DevLoading, DevPage } from "@/components/tui/dev-shell";
import { DevTable, KpiStrip, NetAlert, PanelToggle, UsageBar, useDeviceList, type Col } from "@/components/dev-net-panels";
import { Bar } from "@/components/tui/bar";
import { formatUptime, formatBps, formatResponseTime, timeAgo } from "@/lib/format";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface RouterOSClient {
  mac: string;
  ip: string;
  hostname: string | null;
  server: string | null;
}

interface DeviceStatus {
  isOnline: boolean;
  pingMs: number | null;
  httpOk: boolean | null;
  uptime: number | null;
  cpuLoad: number | null;
  memoryUsed: number | null;
  checkedAt: string;
  routerosData?: { clients: RouterOSClient[]; resourceError?: string | null } | null;
}

interface MikrotikDevice {
  id: string;
  name: string;
  ip: string;
  location: string | null;
  pingEnabled: boolean;
  httpEnabled: boolean;
  routerosEnabled: boolean;
  currentStatus: DeviceStatus | null;
}

interface AssociatedLink {
  id: string;
  name: string;
  location: string | null;
  isOnline: boolean;
  mikrotikInterface: string | null;
  downloadBps: number | null;
  uploadBps: number | null;
  contractedDownloadBps: number | null;
  contractedUploadBps: number | null;
}

type LinkWithDevice = AssociatedLink & { mikrotikDeviceId: string | null };

// ── Peças ──────────────────────────────────────────────────────────────────────

/** Tráfego atual; com banda contratada mostra a barra de utilização com % ao lado. */
function UtilCell({ bps, contractedBps, label }: { bps: number | null; contractedBps: number | null; label: string }) {
  if (!bps || !contractedBps) return <span className="dim">{formatBps(bps)}</span>;
  const pct = Math.min((bps / contractedBps) * 100, 100);
  return (
    <span className="barwrap">
      <Bar pct={pct} width="8ch" label={label} />
      <span>{formatBps(bps)}</span>
    </span>
  );
}

const LINK_COLS: Col<AssociatedLink>[] = [
  { key: "name", head: "Link", className: "name", cell: (l) => <>{l.name}{l.location ? <span className="dim" style={{ fontWeight: 400 }}> · {l.location}</span> : null}</> },
  { key: "if", head: "Interface", className: "dim", cell: (l) => l.mikrotikInterface ?? "—" },
  { key: "st", head: "Status", cell: (l) => (l.isOnline ? <span className="ok">● online</span> : <span className="crit">✖ offline</span>) },
  { key: "dl", head: "↓ download", cell: (l) => <UtilCell bps={l.downloadBps} contractedBps={l.contractedDownloadBps} label={`Download de ${l.name}`} /> },
  { key: "ul", head: "↑ upload", cell: (l) => <UtilCell bps={l.uploadBps} contractedBps={l.contractedUploadBps} label={`Upload de ${l.name}`} /> },
];

const DHCP_COLS: Col<RouterOSClient>[] = [
  { key: "host", head: "Hostname", className: "name", cell: (c) => c.hostname ?? <span className="dim">sem nome</span> },
  { key: "ip", head: "IP", className: "dim", cell: (c) => c.ip || "—" },
  { key: "mac", head: "MAC", className: "dim", cell: (c) => c.mac },
  { key: "srv", head: "Servidor", className: "dim", hideSm: true, cell: (c) => c.server ?? "—" },
];

// ── Painel de um Mikrotik ─────────────────────────────────────────────────────

function DevicePanel({ device, links }: { device: MikrotikDevice; links: AssociatedLink[] }) {
  const [linksOpen, setLinksOpen] = useState(false);
  const [clientsOpen, setClientsOpen] = useState(false);

  const status      = device.currentStatus;
  const isOnline    = status?.isOnline ?? false;
  const hasMetrics  = status?.cpuLoad != null || status?.memoryUsed != null;
  const hasCpuAlert = (status?.cpuLoad ?? 0) > 80;
  const hasMemAlert = (status?.memoryUsed ?? 0) > 85;
  // Online via RouterOS, mas /system/resource não retornou métricas (uptime/CPU/mem)
  const resourceError = isOnline && !hasMetrics && status?.uptime == null
    ? status?.routerosData?.resourceError ?? null
    : null;
  const clients = status?.routerosData?.clients ?? null;

  return (
    <Panel
      title={device.name}
      sub={`${device.ip}${device.location ? ` · ${device.location}` : ""}${device.routerosEnabled ? " · RouterOS API" : ""}`}
      color={isOnline ? "ok" : "crit"}
      hot={!isOnline}
      right={<Link href={`/devices/${device.id}`} style={{ color: "inherit" }}>detalhes ›</Link>}
    >
      <div className="d-stack" style={{ gap: 10, paddingBottom: 0 }}>
        <div className="d-line">
          <StatusBadge isOnline={isOnline} />
          {status?.checkedAt && <span className="dim">verificado {timeAgo(status.checkedAt)}</span>}
        </div>

        {(hasCpuAlert || hasMemAlert) && (
          <NetAlert tone="crit">
            {[
              hasCpuAlert && `CPU em ${status!.cpuLoad!.toFixed(0)}% — acima do limite`,
              hasMemAlert && `Memória em ${status!.memoryUsed!.toFixed(0)}% — risco de instabilidade`,
            ].filter(Boolean).join(" · ")}
          </NetAlert>
        )}

        {resourceError && (
          <NetAlert tone="warn">
            Métricas do sistema (uptime/CPU/memória) indisponíveis — provável permissão da API no RouterOS.
            Garanta que o usuário da API tenha a policy <code>read</code>.
          </NetAlert>
        )}

        {status ? (
          <div className="d-tiles">
            {status.pingMs != null && <div className="d-tile"><div className="k">ping</div><div className="v" style={{ fontSize: 14 }}>{formatResponseTime(status.pingMs)}</div></div>}
            {status.uptime != null && <div className="d-tile"><div className="k">uptime</div><div className="v" style={{ fontSize: 14 }}>{formatUptime(status.uptime)}</div></div>}
            {status.httpOk != null && (
              <div className="d-tile">
                <div className="k">http</div>
                <div className={`v ${status.httpOk ? "ok" : "crit"}`} style={{ fontSize: 14 }}>{status.httpOk ? "● OK" : "✖ Falha"}</div>
              </div>
            )}
            {status.cpuLoad != null && <div className="d-tile"><div className="k">cpu</div><div className="v" style={{ fontSize: 13 }}><UsageBar value={status.cpuLoad} label={`CPU de ${device.name}`} width="6ch" /></div></div>}
            {status.memoryUsed != null && <div className="d-tile"><div className="k">memória</div><div className="v" style={{ fontSize: 13 }}><UsageBar value={status.memoryUsed} label={`Memória de ${device.name}`} width="6ch" /></div></div>}
          </div>
        ) : (
          <div className="dim">◌ aguardando primeira coleta…</div>
        )}

        {links.length > 0 && (
          <PanelToggle open={linksOpen} onToggle={() => setLinksOpen((v) => !v)} label="Links de Internet" count={links.length}>
            <DevTable label="Links de internet" cols={LINK_COLS} rows={links} rowKey={(l) => l.id} />
          </PanelToggle>
        )}

        {device.routerosEnabled && (
          <PanelToggle open={clientsOpen} onToggle={() => setClientsOpen((v) => !v)} label="Clientes DHCP" count={clients?.length}>
            {clients === null ? (
              <div className="dim">◌ aguardando primeira coleta…</div>
            ) : clients.length === 0 ? (
              <div className="dim">░ nenhum cliente DHCP ativo.</div>
            ) : (
              <DevTable label="Clientes DHCP ativos" cols={DHCP_COLS} rows={clients} rowKey={(c) => c.mac} />
            )}
          </PanelToggle>
        )}
      </div>
    </Panel>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function MikrotikPage() {
  const [links, setLinks] = useState<LinkWithDevice[]>([]);

  const loadLinks = useCallback(async () => {
    const res = await fetch("/api/links");
    if (res.ok) setLinks(await res.json());
  }, []);

  const { devices, loading, error, lastUpdated, isChecking, checkAll, reload } = useDeviceList<MikrotikDevice>("MIKROTIK", loadLinks);

  const online   = devices.filter((d) => d.currentStatus?.isOnline).length;
  const offline  = devices.length - online;
  const withCpu  = devices.filter((d) => d.currentStatus?.cpuLoad != null);
  const withMem  = devices.filter((d) => d.currentStatus?.memoryUsed != null);
  const withPing = devices.filter((d) => d.currentStatus?.pingMs != null);

  const avgCpu  = withCpu.length  ? withCpu.reduce((s, d)  => s + d.currentStatus!.cpuLoad!,    0) / withCpu.length  : null;
  const avgMem  = withMem.length  ? withMem.reduce((s, d)  => s + d.currentStatus!.memoryUsed!, 0) / withMem.length  : null;
  const avgPing = withPing.length ? withPing.reduce((s, d) => s + d.currentStatus!.pingMs!,     0) / withPing.length : null;

  const sortedDevices = [...devices].sort((a, b) => {
    const aOn = a.currentStatus?.isOnline ?? false;
    const bOn = b.currentStatus?.isOnline ?? false;
    if (aOn !== bOn) return aOn ? 1 : -1; // offline primeiro
    return a.name.localeCompare(b.name);
  });

  return (
    <DevPage
      title="Painel Mikrotik"
      sub={loading ? "carregando…" : `${devices.length} dispositivo${devices.length !== 1 ? "s" : ""} registrado${devices.length !== 1 ? "s" : ""}`}
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
            { label: "Online", value: `${online}/${devices.length}`, sub: "dispositivos ativos", tone: offline > 0 ? "warn" : "ok" },
            { label: "Ping médio", value: avgPing != null ? `${avgPing.toFixed(0)}ms` : "—", sub: "dispositivos com ping", tone: avgPing == null ? "dim" : avgPing < 50 ? "ok" : avgPing < 150 ? "warn" : "crit" },
            { label: "CPU média", value: avgCpu != null ? `${avgCpu.toFixed(0)}%` : "—", sub: "via RouterOS API", tone: avgCpu == null ? "dim" : avgCpu > 70 ? "crit" : avgCpu > 40 ? "warn" : "ok" },
            { label: "Mem média", value: avgMem != null ? `${avgMem.toFixed(0)}%` : "—", sub: "via RouterOS API", tone: avgMem == null ? "dim" : avgMem > 85 ? "crit" : avgMem > 60 ? "warn" : "ok" },
          ]}
        />

        {loading ? (
          <Panel title="mikrotik" color="info"><DevLoading rows={5} label="Carregando Mikrotik" /></Panel>
        ) : error && devices.length === 0 ? (
          <DevError message="Não foi possível carregar os Mikrotik." onRetry={() => void reload()} />
        ) : devices.length === 0 ? (
          <Panel title="mikrotik" color="info">
            <DevEmpty
              title="Nenhum Mikrotik registrado"
              hint="Adicione um dispositivo do tipo Mikrotik para visualizar o painel."
              action={<Link href="/devices/new" className="btn pri">+ novo dispositivo</Link>}
            />
          </Panel>
        ) : (
          sortedDevices.map((d) => (
            <DevicePanel key={d.id} device={d} links={links.filter((l) => l.mikrotikDeviceId === d.id)} />
          ))
        )}
      </div>
    </DevPage>
  );
}
