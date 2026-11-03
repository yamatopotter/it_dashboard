"use client";

// Visão geral clássica, agora no padrão TUI (painéis btop). A visão de plantão completa é o TOWER (/tower);
// esta tela fica como resumo: saúde, problemas, links, linha do tempo 24h e amostra de dispositivos.
import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/use-polling";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useListNav } from "@/hooks/use-list-nav";
import { DeviceDetailDrawer } from "@/components/device-detail-drawer";
import { LinkDetailDrawer } from "@/components/link-detail-drawer";
import { BandwidthCell } from "@/components/bandwidth-cell";
import { Panel } from "@/components/tui/panel";
import { Bar } from "@/components/tui/bar";
import { Spark } from "@/components/tui/spark";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkChips, LnkEmpty, LnkLoading } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { DEVICE_TYPE_LABEL } from "@/lib/device-constants";
import { timeAgo, fmtTime } from "@/lib/format";
import type { Device, DeviceStatus, DeviceType } from "@prisma/client";
import type { HealthData } from "@/app/api/health/route";
import type { Incident } from "@/app/api/incidents/route";
import type { OverviewData, SegmentState } from "@/app/api/overview/route";
import type { TimelineEvent } from "@/app/api/timeline/route";
import type { WifiSignalData } from "@/lib/wifi-signal-map";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null; wifiSignal?: WifiSignalData | null };

interface LinkItem {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  isOnline: boolean;
  lastEventAt: string | null;
  downloadBps: number | null;
  uploadBps: number | null;
  contractedDownloadBps: number | null;
  contractedUploadBps: number | null;
  latencyMs: number | null;
  _count: { events: number };
}

type StatusFilter = "ALL" | "ONLINE" | "OFFLINE";
type TypeFilter = DeviceType | "ALL";
type NavItem = { kind: "device" | "link"; id: string };

const TYPE_CHIPS: TypeFilter[] = ["ALL", "MIKROTIK", "OMADA_AP", "UNIFI_AP", "DVR", "CAMERA", "OTHER"];
const HIGH_LATENCY_MS = 150;
const MAX_PROBLEMS = 8;
const MAX_DEVICES = 12;

const HELP: HelpRow[] = [
  ["j k", "selecionar linha (problemas, links, dispositivos)"],
  ["⏎", "abrir o painel do item selecionado"],
  ["1 2 3", "dispositivos: todos / online / offline"],
  ["r", "atualizar agora"],
  ["t", "ir para o TOWER (visão de plantão)"],
  ["esc", "fechar painel ou ajuda"],
];

const SEG_CLASS: Record<SegmentState, string> = { online: "", offline: "crit", degraded: "warn", empty: "empty" };

const KIND: Record<TimelineEvent["kind"], { glyph: "ok" | "warn" | "crit"; text: string }> = {
  DEVICE_OFFLINE: { glyph: "crit", text: "ficou offline" },
  DEVICE_ONLINE: { glyph: "ok", text: "voltou a responder" },
  DEVICE_HIGH_LATENCY: { glyph: "warn", text: "latência alta" },
  LINK_DOWN: { glyph: "crit", text: "link de internet caiu" },
  LINK_UP: { glyph: "ok", text: "reconectado" },
};

function pingValues(values: (number | null)[] | undefined): number[] {
  return (values ?? []).map((v) => v ?? 0);
}

export default function OverviewPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [drawerDeviceId, setDrawerDeviceId] = useState<string | null>(null);
  const [drawerLinkId, setDrawerLinkId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [devRes, linkRes, healthRes, incRes, ovRes, tlRes] = await Promise.all([
        fetch("/api/devices", { signal }),
        fetch("/api/links", { signal }),
        fetch("/api/health", { signal }),
        fetch("/api/incidents?hours=168", { signal }),
        fetch("/api/overview", { signal }),
        fetch("/api/timeline?hours=24", { signal }),
      ]);
      if (devRes.ok) setDevices(await devRes.json());
      if (linkRes.ok) setLinks(await linkRes.json());
      if (healthRes.ok) setHealth(await healthRes.json());
      if (incRes.ok) { const inc = await incRes.json(); setIncidents(inc.data ?? inc); }
      if (ovRes.ok) setOverviewData(await ovRes.json());
      if (tlRes.ok) setTimeline(await tlRes.json());
      setLoadFailed(!devRes.ok);
      setLastUpdated(new Date());
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      console.error("[overview] falha ao carregar dados:", err);
      setLoadFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  usePolling(load, 30_000);

  const online = devices.filter((d) => d.currentStatus?.isOnline).length;
  const offline = devices.length - online;
  const instavel = devices.filter((d) => d.currentStatus?.isOnline && (d.currentStatus.pingMs ?? 0) > HIGH_LATENCY_MS).length;
  const wifiClients = devices.reduce((sum, d) => {
    if (!d.currentStatus?.isOnline) return sum;
    if (d.type === "UNIFI_AP") return sum + (((d.currentStatus.unifiData as { totalClients?: number } | null)?.totalClients) ?? 0);
    if (d.type === "OMADA_AP") return sum + (((d.currentStatus as { omadaData?: { totalClients?: number } }).omadaData?.totalClients) ?? 0);
    return sum;
  }, 0);
  const wifiAps = devices.filter((d) => d.type === "UNIFI_AP" || d.type === "OMADA_AP").length;
  const withPing = devices.filter((d) => d.currentStatus?.isOnline && d.currentStatus.pingMs != null);
  const avgPing = withPing.length > 0 ? Math.round(withPing.reduce((s, d) => s + (d.currentStatus!.pingMs ?? 0), 0) / withPing.length) : 0;
  const pingClass = avgPing === 0 ? "dim" : avgPing < 50 ? "ok" : avgPing < HIGH_LATENCY_MS ? "warn" : "crit";
  const pingGlyph = avgPing === 0 ? "unk" : avgPing < 50 ? "ok" : avgPing < HIGH_LATENCY_MS ? "warn" : "crit";
  const pingText = avgPing === 0 ? "sem dados" : avgPing < 50 ? "saudável" : avgPing < HIGH_LATENCY_MS ? "atenção" : "crítico";

  const openIncidentByDevice = useMemo(
    () => Object.fromEntries(incidents.filter((i) => !i.resolved).map((i) => [i.deviceId, i.startAt])),
    [incidents],
  );

  const problemDevices = useMemo(
    () => [
      ...devices.filter((d) => !(d.currentStatus?.isOnline ?? false)),
      ...devices.filter((d) => d.currentStatus?.isOnline && (d.currentStatus.pingMs ?? 0) > HIGH_LATENCY_MS),
    ],
    [devices],
  );
  const shownProblems = problemDevices.slice(0, MAX_PROBLEMS);

  const filtered = useMemo(
    () => devices.filter((d) => {
      const typeMatch = filter === "ALL" || d.type === filter;
      const statusMatch = statusFilter === "ALL" || (statusFilter === "ONLINE" && d.currentStatus?.isOnline) || (statusFilter === "OFFLINE" && !d.currentStatus?.isOnline);
      return typeMatch && statusMatch;
    }),
    [devices, filter, statusFilter],
  );
  const shownDevices = filtered.slice(0, MAX_DEVICES);

  // Itens navegáveis, na ordem em que aparecem na tela
  const items: NavItem[] = useMemo(
    () => [
      ...shownProblems.map((d) => ({ kind: "device" as const, id: d.id })),
      ...links.map((l) => ({ kind: "link" as const, id: l.id })),
      ...shownDevices.map((d) => ({ kind: "device" as const, id: d.id })),
    ],
    [shownProblems, links, shownDevices],
  );
  const nav = useListNav(items.length);
  const openItem = (it: NavItem | undefined) => {
    if (!it) return;
    if (it.kind === "device") setDrawerDeviceId(it.id);
    else setDrawerLinkId(it.id);
  };

  const keys: HotkeyMap = { "?": () => setHelp((h) => !h), Escape: () => setHelp(false) };
  if (!help && !drawerDeviceId && !drawerLinkId) {
    Object.assign(keys, nav.keys, {
      Enter: () => openItem(items[nav.sel]),
      "1": () => setStatusFilter("ALL"),
      "2": () => setStatusFilter("ONLINE"),
      "3": () => setStatusFilter("OFFLINE"),
      r: () => void load(),
      t: () => router.push("/tower"),
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["j", "k"], label: "selecionar" },
    { keys: ["⏎"], label: "abrir" },
    { keys: ["1", "–", "3"], label: "filtro", hideSm: true },
    { keys: ["r"], label: "atualizar" },
    { keys: ["t"], label: "TOWER", hideSm: true },
    { keys: ["?"], label: "ajuda" },
  ];

  const problemOffset = 0;
  const linkOffset = shownProblems.length;
  const deviceOffset = shownProblems.length + links.length;
  const sel = (i: number) => i === nav.sel;
  const rowProps = (i: number, onOpen: () => void) => ({
    className: `tl${sel(i) ? " sel" : ""}`,
    "data-sel": sel(i) ? "true" : undefined,
    "aria-current": sel(i) ? ("true" as const) : undefined,
    role: "button" as const,
    tabIndex: 0,
    onClick: () => { nav.setSel(i); onOpen(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } },
  });

  const onlinePct = devices.length > 0 ? (online / devices.length) * 100 : null;
  const workerStale = health?.workerStatus === "stale";
  const linksOnline = links.filter((l) => l.isOnline).length;

  return (
    <LnkShell
      title="VISÃO GERAL"
      sub={
        <>
          resumo · plantão completo no <Link href="/tower" className="info">TOWER</Link>
        </>
      }
      updatedAt={lastUpdated}
      pollMs={30_000}
      actions={
        <button type="button" className="btn" onClick={() => void load()}>
          <kbd>r</kbd>atualizar
        </button>
      }
      hints={hints}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      {workerStale && (
        <p className="note crit-n" role="alert">
          ✖ O worker de monitoramento parou de responder
          {health?.workerLastSeen ? ` (último sinal ${timeAgo(health.workerLastSeen)})` : ""}. Os dados abaixo podem estar desatualizados.
        </p>
      )}
      {loadFailed && !loading && (
        <p className="note crit-n" role="alert">
          ✖ Falha ao carregar parte dos dados. Tentando de novo a cada 30s.
        </p>
      )}

      <Panel title="saúde do sistema" sub={lastUpdated ? `verificado às ${fmtTime(lastUpdated)}` : undefined} color={offline > 0 ? "crit" : instavel > 0 ? "warn" : "ok"} hot={offline > 0}>
        {loading ? (
          <LnkLoading what="resumo" />
        ) : (
          <dl className="kv" style={{ gridTemplateColumns: "16ch 1fr", gap: "4px 12px" }}>
            <dt>dispositivos</dt>
            <dd>
              <span className="ok">● {online}</span> online · <span className={instavel > 0 ? "warn" : "dim"}>▲ {instavel}</span> instáveis ·{" "}
              <span className={offline > 0 ? "crit" : "dim"}>✖ {offline}</span> offline
              {onlinePct != null && <> <Bar pct={onlinePct} width="12ch" label="dispositivos online" /></>}
            </dd>
            <dt>uptime 24h</dt>
            <dd>{health ? <Bar pct={health.uptimePct} width="12ch" label="uptime 24h" /> : <span className="dim">—</span>}</dd>
            <dt>latência média</dt>
            <dd>
              <StateGlyph state={pingGlyph} label={pingText} /> <span className={pingClass}>{avgPing > 0 ? `${avgPing} ms` : "—"}</span> <span className="dim">{pingText}</span>
            </dd>
            <dt>links</dt>
            <dd>
              <StateGlyph state={links.length === 0 ? "unk" : linksOnline === links.length ? "ok" : "crit"} label="links" /> {linksOnline}/{links.length} ativos
            </dd>
            {wifiAps > 0 && (
              <>
                <dt>clientes Wi-Fi</dt>
                <dd>{wifiClients} em {wifiAps} {wifiAps === 1 ? "AP" : "APs"}</dd>
              </>
            )}
            <dt>worker</dt>
            <dd>
              {health?.workerStatus === "ok" ? <span className="ok">● ativo</span> : workerStale ? <span className="crit">✖ parado</span> : <span className="dim">◌ sem dado</span>}
            </dd>
          </dl>
        )}
      </Panel>

      <div className="cols2">
        <Panel
          title="problemas ativos"
          sub={problemDevices.length > 0 ? `${problemDevices.length}` : undefined}
          color={problemDevices.length > 0 ? "crit" : "ok"}
          hot={problemDevices.length > 0}
          right={problemDevices.length > 0 ? <Link href="/incidents">ver todos →</Link> : undefined}
        >
          {loading ? (
            <LnkLoading what="problemas" />
          ) : problemDevices.length === 0 ? (
            <LnkEmpty ok title="Todos os dispositivos operacionais" hint="Nenhum problema detectado no momento." />
          ) : (
            <div className="tlist">
              {shownProblems.map((d, i) => {
                const isOnline = d.currentStatus?.isOnline ?? false;
                const ms = d.currentStatus?.pingMs;
                const offlineAt = openIncidentByDevice[d.id];
                const desc = isOnline ? `latência alta (${ms}ms)` : offlineAt ? `offline ${timeAgo(offlineAt)}` : "sem resposta";
                const idx = problemOffset + i;
                return (
                  <div key={d.id} {...rowProps(idx, () => setDrawerDeviceId(d.id))} aria-label={`Detalhes de ${d.name}`}>
                    <span className={isOnline ? "warn" : "crit"}>{isOnline ? "instável" : "offline"}</span>
                    <StateGlyph state={isOnline ? "warn" : "crit"} label={isOnline ? "instável" : "offline"} />
                    <span>
                      <b>{d.name}</b> <span className={isOnline ? "warn" : "crit"}>{desc}</span>
                      <span className="dim"> {DEVICE_TYPE_LABEL[d.type]}{d.location ? ` · ${d.location}` : ""} · {d.ip}</span>
                    </span>
                    <span className="tl-end">
                      {(overviewData?.sparklines[d.id]?.filter((v) => v !== null).length ?? 0) >= 3 ? (
                        <span style={{ display: "inline-block", width: 70 }}>
                          <Spark values={pingValues(overviewData?.sparklines[d.id])} color={isOnline ? "var(--warn)" : "var(--crit)"} height={20} />
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
              {problemDevices.length > MAX_PROBLEMS && <p className="note">… e mais {problemDevices.length - MAX_PROBLEMS} em Incidentes.</p>}
            </div>
          )}
        </Panel>

        <Panel title="linha do tempo" sub="últimas 24h" color="info" right={<Link href="/incidents">incidentes →</Link>}>
          {loading ? (
            <LnkLoading what="eventos" />
          ) : timeline.length === 0 ? (
            <LnkEmpty ok title="Nenhum incidente nas últimas 24h" hint="Todos os sistemas operando normalmente." />
          ) : (
            <div className="tlist" style={{ maxHeight: 320, overflowY: "auto" }}>
              {timeline.slice(0, 20).map((ev) => {
                const k = KIND[ev.kind];
                return (
                  <div key={ev.id} className="tl plain">
                    <span className="dim">{fmtTime(ev.timestamp, { hour: "2-digit", minute: "2-digit" })}</span>
                    <StateGlyph state={k.glyph} label={k.text} />
                    <span>
                      <b>{ev.entityName}</b> <span className={k.glyph}>{ev.kind === "DEVICE_HIGH_LATENCY" ? `${k.text} (${ev.value}ms)` : k.text}</span>
                      <span className="dim"> {ev.entityType === "LINK" ? "Link" : DEVICE_TYPE_LABEL[ev.entityType]}{ev.ip ? ` · ${ev.ip}` : ""}{ev.location ? ` · ${ev.location}` : ""}</span>
                    </span>
                    <span className="tl-end dim">{timeAgo(ev.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {(loading || links.length > 0) && (
        <Panel title="links de internet" sub={loading ? undefined : `${linksOnline}/${links.length} ativos`} color={links.some((l) => !l.isOnline) ? "crit" : "ok"} hot={links.some((l) => !l.isOnline)} right={<Link href="/links">gerenciar →</Link>}>
          {loading ? (
            <LnkLoading what="links" />
          ) : (
            <div className="tblwrap">
              <table className="tbl" aria-label="Links de internet">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Estado</span></th>
                    <th scope="col">Link</th>
                    <th scope="col" className="r">↓ Download</th>
                    <th scope="col" className="r hide-md">↑ Upload</th>
                    <th scope="col" className="hide-md">Estabilidade 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link, li) => {
                    const idx = linkOffset + li;
                    const segs = overviewData?.linkSegments[link.id];
                    const withData = segs?.filter((s) => s !== "empty") ?? [];
                    const uptimePct = withData.length > 0 ? (withData.filter((s) => s === "online" || s === "degraded").length / withData.length) * 100 : null;
                    return (
                      <tr
                        key={link.id}
                        className={sel(idx) ? "sel" : undefined}
                        data-sel={sel(idx) ? "true" : undefined}
                        aria-current={sel(idx) ? "true" : undefined}
                        onClick={() => { nav.setSel(idx); setDrawerLinkId(link.id); }}
                      >
                        <td className="keep" style={{ width: "3ch" }}>
                          <StateGlyph state={link.isOnline ? "ok" : "crit"} label={link.isOnline ? "online" : "offline"} />
                        </td>
                        <td>
                          <span className="nm">{link.name}</span>
                          {(link.description || link.location) && <span className="sm">{[link.description, link.location].filter(Boolean).join(" · ")}</span>}
                        </td>
                        <td className="r"><BandwidthCell current={link.downloadBps} contracted={link.contractedDownloadBps} color="success" label="uso do download contratado" /></td>
                        <td className="r hide-md"><BandwidthCell current={link.uploadBps} contracted={link.contractedUploadBps} color="primary" label="uso do upload contratado" /></td>
                        <td className="hide-md" style={{ minWidth: "26ch" }}>
                          {segs ? (
                            <>
                              <div className="segs" role="img" aria-label={`Estabilidade 24h${uptimePct != null ? `: ${uptimePct.toFixed(1)}% disponível` : ""}`}>
                                {segs.map((s, i) => <i key={i} className={SEG_CLASS[s]} />)}
                              </div>
                              {uptimePct !== null && <span className="sm">{uptimePct.toFixed(1)}% disponível</span>}
                            </>
                          ) : <span className="dim">◌</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Panel title="dispositivos" sub={loading ? "amostra" : `${shownDevices.length} de ${filtered.length}`} color="info" right={<Link href="/devices">ver {devices.length} dispositivos →</Link>}>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <LnkChips<StatusFilter>
            label="Filtro de estado"
            value={statusFilter}
            onChange={setStatusFilter}
            chips={[
              { value: "ALL", label: "todos", key: "1" },
              { value: "ONLINE", label: "online", key: "2" },
              { value: "OFFLINE", label: "offline", key: "3" },
            ]}
          />
          <LnkChips<TypeFilter>
            label="Filtro de tipo"
            value={filter}
            onChange={setFilter}
            chips={TYPE_CHIPS.map((t) => ({
              value: t,
              label: t === "ALL" ? "todos os tipos" : DEVICE_TYPE_LABEL[t],
              count: t === "ALL" ? undefined : devices.filter((d) => d.type === t).length,
            }))}
          />
        </div>
        {loading ? (
          <LnkLoading what="dispositivos" />
        ) : filtered.length === 0 ? (
          devices.length === 0 ? (
            <LnkEmpty title="Nenhum dispositivo cadastrado." action={<Link href="/devices/new" className="btn primary" style={{ textDecoration: "none" }}>cadastrar primeiro dispositivo</Link>} />
          ) : (
            <LnkEmpty title="Nenhum dispositivo encontrado para os filtros selecionados." />
          )
        ) : (
          <div className="tblwrap">
            <table className="tbl" aria-label="Dispositivos">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Estado</span></th>
                  <th scope="col">Dispositivo</th>
                  <th scope="col" className="hide-md">Tipo</th>
                  <th scope="col" className="r">Ping</th>
                  <th scope="col" className="hide-md">Histórico</th>
                  <th scope="col" className="hide-md">Wi-Fi</th>
                </tr>
              </thead>
              <tbody>
                {shownDevices.map((d, di) => {
                  const idx = deviceOffset + di;
                  const st = d.currentStatus;
                  const isOnline = st?.isOnline ?? false;
                  const ping = st?.pingMs;
                  const unstable = isOnline && (ping ?? 0) > HIGH_LATENCY_MS;
                  const acked = !isOnline && !!d.offlineAcknowledgedAt;
                  const spark = overviewData?.sparklines[d.id];
                  const w = d.wifiSignal;
                  return (
                    <tr
                      key={d.id}
                      className={sel(idx) ? "sel" : undefined}
                      data-sel={sel(idx) ? "true" : undefined}
                      aria-current={sel(idx) ? "true" : undefined}
                      aria-label={`Detalhes de ${d.name}`}
                      onClick={() => { nav.setSel(idx); setDrawerDeviceId(d.id); }}
                    >
                      <td className="keep" style={{ width: "3ch" }}>
                        <StateGlyph state={unstable ? "warn" : acked ? "ack" : isOnline ? "ok" : "crit"} label={unstable ? "instável" : acked ? "reconhecido" : isOnline ? "online" : "offline"} />
                      </td>
                      <td>
                        <span className="nm">{d.name}</span>
                        <span className="sm">{d.ip}{d.location ? ` · ${d.location}` : ""}</span>
                      </td>
                      <td className="hide-md">{DEVICE_TYPE_LABEL[d.type]}</td>
                      <td className={`r${unstable ? " warn" : ""}`}>{ping != null ? `${ping} ms` : "—"}</td>
                      <td className="hide-md" style={{ width: 90 }}>
                        {spark && spark.filter((v) => v !== null).length >= 3 ? <Spark values={pingValues(spark)} color={unstable ? "var(--warn)" : isOnline ? "var(--ok)" : "var(--crit)"} height={20} label={`Histórico de ping de ${d.name}`} /> : <span className="dim">sem histórico</span>}
                      </td>
                      <td className="hide-md">
                        {w ? (
                          <>
                            <span className={w.signal == null ? "dim" : w.signal >= -65 ? "ok" : w.signal >= -75 ? "warn" : "crit"}>{w.signal != null ? `${w.signal} dBm` : "—"}</span>
                            {w.snr != null && <span className="dim"> SNR {w.snr}</span>}
                            <span className="sm">{w.apName}</span>
                          </>
                        ) : <span className="dim">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <DeviceDetailDrawer deviceId={drawerDeviceId} onClose={() => setDrawerDeviceId(null)} />
      <LinkDetailDrawer linkId={drawerLinkId} onClose={() => setDrawerLinkId(null)} />
    </LnkShell>
  );
}
