"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePolling } from "@/hooks/use-polling";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeviceDetailDrawer } from "@/components/device-detail-drawer";
import { StatusBadge } from "@/components/status-badge";
import { PingSparkline } from "@/components/ping-sparkline";
import { GlobalIntervalModal } from "@/components/device-interval-dialog";
import { Panel } from "@/components/tui/panel";
import { DevEmpty, DevError, DevLoading, DevPage, useListKeys } from "@/components/tui/dev-shell";
import { formatResponseTime, formatUptime, formatPercent } from "@/lib/format";
import { DEVICE_TYPE_LABEL } from "@/lib/device-constants";
import { pctLevel } from "@/lib/tui-format";
import { useDeviceNotifications } from "@/hooks/use-device-notifications";
import type { Device, DeviceStatus, DeviceType } from "@prisma/client";
import type { OverviewData } from "@/app/api/overview/route";
import type { WifiSignalData } from "@/lib/wifi-signal-map";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null; wifiSignal?: WifiSignalData | null };
type ViewMode = "table" | "cards";
type SortField = "name" | "ip" | "type" | "status" | "ping" | "location";
type SortDir = "asc" | "desc";

const TYPES = ["MIKROTIK", "OMADA_AP", "UNIFI_AP", "DVR", "CAMERA", "OTHER"] as const;

const SORT_LABELS: Record<SortField, string> = {
  name: "Nome", ip: "IP", type: "Tipo", status: "Status", ping: "Ping", location: "Local",
};

const HELP: HelpRow[] = [
  ["j k ↑ ↓", "mover a seleção"],
  ["⏎", "abrir detalhe (painel lateral)"],
  ["e", "editar o dispositivo selecionado"],
  ["n", "novo dispositivo"],
  ["v", "alternar tabela / cartões"],
  ["/", "buscar por nome ou IP"],
  ["esc", "sair da busca / fechar ajuda"],
];

const HINTS: KeyHint[] = [
  { keys: ["j", "k"], label: "mover" },
  { keys: ["⏎"], label: "abrir" },
  { keys: ["e"], label: "editar", hideSm: true },
  { keys: ["n"], label: "novo", hideSm: true },
  { keys: ["v"], label: "visão", hideSm: true },
  { keys: ["/"], label: "buscar" },
  { keys: ["?"], label: "ajuda" },
];

function pingClass(ms: number | null | undefined, online: boolean): string {
  if (!online || ms == null) return "dim";
  return ms < 50 ? "ok" : ms < 150 ? "warn" : "crit";
}

function rssiClass(dbm: number | null) {
  if (dbm == null) return "dim";
  return dbm >= -65 ? "ok" : dbm >= -75 ? "warn" : "crit";
}

function snrClass(db: number | null) {
  if (db == null) return "dim";
  return db >= 25 ? "ok" : db >= 15 ? "warn" : "crit";
}

function UsageBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const lvl = pctLevel(v);
  return (
    <span className="barwrap">
      <span
        className={`bar${lvl === "crit" ? " c" : lvl === "warn" ? " w" : ""}`}
        style={{ "--p": Math.round(v), width: "7ch" } as React.CSSProperties}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v)}
      >
        <i />
      </span>
      <span className={lvl}>{formatPercent(value)}</span>
    </span>
  );
}

function isUnstable(d: DeviceWithStatus) {
  const s = d.currentStatus;
  return !!s?.isOnline && (s.pingMs ?? 0) > 150;
}

function SortableHeader({
  field, label, sortField, sortDir, onSort, className,
}: {
  field: SortField; label: string; sortField: SortField; sortDir: SortDir;
  onSort: (f: SortField) => void; className?: string;
}) {
  const active = sortField === field;
  return (
    <th className={className} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(field)}>
        {label}
        <span className="sr-only">
          {active ? `, ordenado ${sortDir === "asc" ? "crescente" : "decrescente"}` : ", clique para ordenar"}
        </span>
        <span aria-hidden="true">{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</span>
      </button>
    </th>
  );
}

/** Cartão compacto (visão em cartões): painel btop com estado, ping + sparkline e sinal Wi-Fi. */
function DeviceTile({
  device, sparkline, selected, index, onOpen,
}: {
  device: DeviceWithStatus; sparkline?: (number | null)[]; selected: boolean; index: number; onOpen: () => void;
}) {
  const status = device.currentStatus;
  const isOnline = status?.isOnline ?? false;
  const ping = status?.pingMs;
  const acked = !isOnline && !!device.offlineAcknowledgedAt;
  return (
    <div
      role="button"
      tabIndex={0}
      data-row-idx={index}
      aria-label={`${device.name}, abrir detalhe`}
      className={`d-card${selected ? " sel" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Panel title={device.name} sub={DEVICE_TYPE_LABEL[device.type]} color={isOnline ? (isUnstable(device) ? "warn" : "ok") : "crit"} hot={!isOnline && !acked} focus={selected}>
        <div className="d-stack" style={{ gap: 6, paddingBottom: 0 }}>
          <div className="d-line">
            <StatusBadge isOnline={isOnline} degraded={isUnstable(device)} acknowledged={acked} />
            <span className="dim">{device.ip}</span>
          </div>
          <div className="d-line" style={{ justifyContent: "space-between" }}>
            <span className={`big ${pingClass(ping, isOnline)}`}>
              {ping ?? "—"}
              {ping != null && <span className="dim" style={{ fontSize: 11, fontWeight: 400 }}> ms</span>}
            </span>
            {sparkline && sparkline.length >= 3 ? (
              <PingSparkline data={sparkline} uid={device.id} width={90} height={32} />
            ) : null}
          </div>
          {device.wifiSignal && (
            <div className="d-line">
              <span className={rssiClass(device.wifiSignal.signal)}>
                {device.wifiSignal.signal != null ? `${device.wifiSignal.signal} dBm` : "—"}
              </span>
              {device.wifiSignal.snr != null && (
                <span className={snrClass(device.wifiSignal.snr)}>SNR {device.wifiSignal.snr} dB</span>
              )}
              <span className="dim v" style={{ marginLeft: "auto" }}>{device.wifiSignal.apName}</span>
            </div>
          )}
          {device.location ? <div className="dim">{device.location}</div> : null}
        </div>
      </Panel>
    </div>
  );
}

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "OFFLINE">("ALL");
  const [typeFilter, setTypeFilter] = useState<DeviceType | "ALL">("ALL");
  const [drawerDeviceId, setDrawerDeviceId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string | "ALL">("ALL");
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(null);
  const filtersReady = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const selRef = useRef(0);
  const viewModeRef = useRef<ViewMode>("table");
  const { notify, requestPermission } = useDeviceNotifications();

  // Preferências (visão e ordenação) lembradas por usuário no navegador.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("devices-view-mode");
      // "compact" (visão NOC antiga) foi incorporada à tabela densa.
      if (saved === "cards") setViewMode("cards");
      const f = localStorage.getItem("devices-sort-field") as SortField | null;
      const d = localStorage.getItem("devices-sort-dir");
      if (f && f in SORT_LABELS) setSortField(f);
      if (d === "asc" || d === "desc") setSortDir(d);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem("devices-view-mode", mode); } catch { /* noop */ }
  }, []);

  function handleSort(field: SortField) {
    const newDir = sortField === field ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    setSortField(field);
    setSortDir(newDir);
    try {
      localStorage.setItem("devices-sort-field", field);
      localStorage.setItem("devices-sort-dir", newDir);
    } catch { /* noop */ }
  }

  // Filtros iniciais vindos da URL (sobrevivem à navegação).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("status"); if (s === "ONLINE" || s === "OFFLINE") setStatusFilter(s);
    const t = p.get("type") as DeviceType | null; if (t) setTypeFilter(t);
    const l = p.get("location"); if (l) setLocationFilter(l);
    const q = p.get("q"); if (q) setSearchQuery(q);
    filtersReady.current = true;
  }, []);

  useEffect(() => {
    if (!filtersReady.current) return;
    const p = new URLSearchParams();
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    if (typeFilter !== "ALL") p.set("type", typeFilter);
    if (locationFilter !== "ALL") p.set("location", locationFilter);
    if (searchQuery) p.set("q", searchQuery);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [statusFilter, typeFilter, locationFilter, searchQuery]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  async function handleEnableNotifications() {
    await requestPermission();
    if ("Notification" in window) setNotifPermission(Notification.permission);
  }

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [devRes, ovRes] = await Promise.all([
        fetch("/api/devices", { signal }),
        fetch("/api/overview", { signal }),
      ]);
      if (devRes.ok) {
        const data = await devRes.json();
        setDevices(data);
        notify(data);
      }
      if (ovRes.ok) setOverviewData(await ovRes.json());
      setLoadError(!devRes.ok);
      if (devRes.ok || ovRes.ok) setLastUpdated(new Date());
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      console.error("[devices] falha ao carregar dados:", err);
      setLoadError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [notify]);

  usePolling(load, 30_000);

  const q = searchQuery.trim().toLowerCase();
  const uniqueLocations = useMemo(
    () => [...new Set(devices.map((d) => d.location).filter(Boolean) as string[])].sort(),
    [devices],
  );
  const filtered = useMemo(() => devices
    .filter((d) => {
      const on = d.currentStatus?.isOnline ?? false;
      const statusMatch = statusFilter === "ALL" || (statusFilter === "ONLINE" ? on : !on);
      const typeMatch = typeFilter === "ALL" || d.type === typeFilter;
      const locationMatch = locationFilter === "ALL" || d.location === locationFilter;
      const searchMatch = !q || d.name.toLowerCase().includes(q) || d.ip.includes(q);
      return statusMatch && typeMatch && locationMatch && searchMatch;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name, "pt-BR");
          break;
        case "ip": {
          const toInt = (ip: string) => ip.split(".").reduce((acc, oct) => (acc << 8) | parseInt(oct), 0) >>> 0;
          cmp = toInt(a.ip) - toInt(b.ip);
          break;
        }
        case "status":
          cmp = (b.currentStatus?.isOnline ? 1 : 0) - (a.currentStatus?.isOnline ? 1 : 0); // online primeiro quando asc
          break;
        case "ping":
          cmp = (a.currentStatus?.pingMs ?? Infinity) - (b.currentStatus?.pingMs ?? Infinity);
          break;
        case "type":
          cmp = DEVICE_TYPE_LABEL[a.type].localeCompare(DEVICE_TYPE_LABEL[b.type], "pt-BR");
          break;
        case "location":
          cmp = (a.location ?? "").localeCompare(b.location ?? "", "pt-BR");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    }), [devices, statusFilter, typeFilter, locationFilter, q, sortField, sortDir]);

  const onOpen = useCallback((i: number) => {
    const d = filtered[i];
    if (d) setDrawerDeviceId(d.id);
  }, [filtered]);

  const extra = useMemo(() => ({
    e: () => { const d = filtered[selRef.current]; if (d) router.push(`/devices/${d.id}/edit`); },
    n: () => router.push("/devices/new"),
    v: () => changeViewMode(viewModeRef.current === "table" ? "cards" : "table"),
  }), [filtered, router, changeViewMode]);

  const { sel, help, setHelp } = useListKeys({ count: filtered.length, onOpen, searchRef, extra, enabled: drawerDeviceId === null });
  useEffect(() => { selRef.current = sel; viewModeRef.current = viewMode; }, [sel, viewMode]);

  const offlineCount = devices.filter((d) => !(d.currentStatus?.isOnline ?? false)).length;

  const actions = (
    <>
      <span className="d-seg" role="group" aria-label="Visualização">
        <button type="button" aria-pressed={viewMode === "table"} onClick={() => changeViewMode("table")}>tabela</button>
        <button type="button" aria-pressed={viewMode === "cards"} onClick={() => changeViewMode("cards")}>cartões</button>
      </span>
      {notifPermission === "default" && (
        <button type="button" className="btn" onClick={handleEnableNotifications} title="Ativar notificações de dispositivos offline">
          notificações
        </button>
      )}
      {notifPermission === "granted" && <span className="ok" title="Notificações ativas">● notificações</span>}
      <GlobalIntervalModal />
      <Link href="/devices/new/bulk" className="btn">em lote</Link>
      <Link href="/devices/new" className="btn pri">+ novo</Link>
    </>
  );

  return (
    <DevPage
      title="Dispositivos"
      sub={loading ? "carregando…" : `${filtered.length}/${devices.length} · ${offlineCount > 0 ? `✖ ${offlineCount} offline` : "● todos online"}`}
      live={!loading && !loadError}
      lastUpdated={lastUpdated}
      actions={actions}
      hints={HINTS}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      <div className="d-filters" role="search">
        <label className="d-search">
          <span className="dim" aria-hidden="true">/</span>
          <input
            ref={searchRef}
            type="text"
            aria-label="Buscar dispositivos"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="nome ou IP"
          />
          {searchQuery && (
            <button type="button" className="btn" style={{ border: 0, padding: 0 }} onClick={() => setSearchQuery("")} aria-label="Limpar busca">
              ✕
            </button>
          )}
        </label>
        <span className="grp" role="group" aria-label="Status">
          <span className="lbl">status</span>
          {([["ALL", "todos"], ["ONLINE", "● online"], ["OFFLINE", "✖ offline"]] as const).map(([v, l]) => (
            <button key={v} type="button" className="chip" aria-pressed={statusFilter === v} onClick={() => setStatusFilter(v)}>{l}</button>
          ))}
        </span>
        <span className="grp" role="group" aria-label="Tipo">
          <span className="lbl">tipo</span>
          <button type="button" className="chip" aria-pressed={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")}>todos</button>
          {TYPES.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {DEVICE_TYPE_LABEL[t]} <span className="dim">{devices.filter((d) => d.type === t).length}</span>
            </button>
          ))}
        </span>
        {uniqueLocations.length > 0 && (
          <span className="grp" role="group" aria-label="Local">
            <span className="lbl">local</span>
            <button type="button" className="chip" aria-pressed={locationFilter === "ALL"} onClick={() => setLocationFilter("ALL")}>todos</button>
            {uniqueLocations.map((loc) => (
              <button key={loc} type="button" className="chip" aria-pressed={locationFilter === loc} onClick={() => setLocationFilter(loc)}>{loc}</button>
            ))}
          </span>
        )}
        {viewMode === "cards" && (
          <span className="grp">
            <label className="lbl" htmlFor="dev-sort">ordem</label>
            <select id="dev-sort" className="d-in" style={{ width: "auto" }} value={sortField} onChange={(e) => handleSort(e.target.value as SortField)}>
              {(Object.entries(SORT_LABELS) as [SortField, string][]).map(([f, l]) => <option key={f} value={f}>{l}</option>)}
            </select>
            <button
              type="button"
              className="btn"
              aria-label={sortDir === "asc" ? "Ordem crescente — alternar para decrescente" : "Ordem decrescente — alternar para crescente"}
              onClick={() => {
                const nd = sortDir === "asc" ? "desc" : "asc";
                setSortDir(nd);
                try { localStorage.setItem("devices-sort-dir", nd); } catch { /* noop */ }
              }}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </span>
        )}
      </div>

      <Panel title="dispositivos" sub={`${filtered.length}`} color="info" focus>
        {loading ? (
          <DevLoading rows={8} label="Carregando dispositivos" />
        ) : loadError && devices.length === 0 ? (
          <DevError message="Não foi possível carregar os dispositivos." onRetry={() => { setLoading(true); void load(); }} />
        ) : filtered.length === 0 ? (
          devices.length === 0 ? (
            <DevEmpty title="Nenhum dispositivo cadastrado." action={<Link href="/devices/new" className="btn pri">cadastrar primeiro dispositivo</Link>} />
          ) : (
            <DevEmpty title="Nenhum dispositivo encontrado para os filtros selecionados." hint="Limpe a busca ou os filtros acima." />
          )
        ) : viewMode === "cards" ? (
          <div className="d-cards">
            {filtered.map((device, i) => (
              <DeviceTile
                key={device.id}
                device={device}
                index={i}
                selected={i === sel}
                sparkline={overviewData?.sparklines[device.id]}
                onOpen={() => setDrawerDeviceId(device.id)}
              />
            ))}
          </div>
        ) : (
          <div className="d-wrap">
            <table className="d-tbl" aria-label="Lista de dispositivos">
              <thead>
                <tr>
                  <SortableHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader field="name" label="Dispositivo" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader field="type" label="Tipo" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hide-sm" />
                  <SortableHeader field="ip" label="IP" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader field="ping" label="Ping" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="hide-sm">CPU</th>
                  <th className="hide-sm">Uptime</th>
                  <SortableHeader field="location" label="Local" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hide-sm" />
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((device, i) => {
                  const status = device.currentStatus;
                  const on = status?.isOnline ?? false;
                  return (
                    <tr
                      key={device.id}
                      data-row-idx={i}
                      aria-selected={i === sel}
                      className={`${i === sel ? "sel" : ""}${!on ? " muted" : ""}`.trim()}
                      onClick={() => setDrawerDeviceId(device.id)}
                    >
                      <td>
                        <StatusBadge isOnline={on} degraded={isUnstable(device)} acknowledged={!on && !!device.offlineAcknowledgedAt} />
                      </td>
                      <td className="name" title={device.name}>
                        <button
                          type="button"
                          style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
                          onClick={(e) => { e.stopPropagation(); setDrawerDeviceId(device.id); }}
                        >
                          {device.name}
                        </button>
                      </td>
                      <td className="hide-sm dim">{DEVICE_TYPE_LABEL[device.type]}</td>
                      <td className="dim">{device.ip}</td>
                      <td className={pingClass(status?.pingMs, on)}>{formatResponseTime(status?.pingMs)}</td>
                      <td className="hide-sm">
                        {status?.cpuLoad != null ? <UsageBar value={status.cpuLoad} label={`CPU de ${device.name}`} /> : <span className="faint">—</span>}
                      </td>
                      <td className="hide-sm dim">{status?.uptime != null ? formatUptime(status.uptime) : "—"}</td>
                      <td className="hide-sm dim">{device.location ?? "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Link href={`/devices/${device.id}/edit`} aria-label={`Editar ${device.name}`} className="btn">
                          editar
                        </Link>
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
    </DevPage>
  );
}
