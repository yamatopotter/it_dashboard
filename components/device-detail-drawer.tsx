"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUptime, fmtTime } from "@/lib/format";
import { DEVICE_TYPE_ICON, DEVICE_TYPE_ICON_BG, DEVICE_TYPE_LABEL } from "@/lib/device-constants";
import { MapPin, History, Zap, X, CheckCheck, Undo2, Wifi } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { WifiSignalResult } from "@/app/api/devices/[id]/wifi-signal/route";
import { PingSparkline } from "@/components/ping-sparkline";
import { MetricTile, InfoRow } from "@/components/drawer-primitives";
import type { Device, DeviceStatus, StatusHistory } from "@prisma/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

// ─── Uptime segments ─────────────────────────────────────────────────────────

type Seg = "online" | "offline" | "degraded" | "empty";

const SEG_COLOR: Record<Seg, string> = {
  online: "bg-success", offline: "bg-destructive", degraded: "bg-warning", empty: "bg-muted/60",
};

function buildSegments(history: StatusHistory[], now: number): Seg[] {
  return Array.from({ length: 48 }, (_, i) => {
    const segEnd = now - i * 1_800_000;          // 30-min slots
    const segStart = segEnd - 1_800_000;
    const checks = history.filter((h) => {
      const t = new Date(h.timestamp).getTime();
      return t >= segStart && t < segEnd;
    });
    if (checks.length === 0) return "empty";
    const pct = checks.filter((h) => h.isOnline).length / checks.length;
    if (pct > 0.8) return "online";
    if (pct > 0.2) return "degraded";
    return "offline";
  }).reverse();
}

// ─── Metric tile ─────────────────────────────────────────────────────────────


// ─── Drawer ───────────────────────────────────────────────────────────────────

interface Props {
  deviceId: string | null;
  onClose: () => void;
  userRole?: string;
}

const HOUR_OPTIONS = [
  { label: "1h",  value: 1   },
  { label: "6h",  value: 6   },
  { label: "24h", value: 24  },
  { label: "7d",  value: 168 },
] as const;
type HourOption = typeof HOUR_OPTIONS[number]["value"];

export function DeviceDetailDrawer({ deviceId, onClose, userRole: userRoleProp }: Props) {
  const [device, setDevice] = useState<DeviceWithStatus | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [wifiSignal, setWifiSignal] = useState<WifiSignalResult | null>(null);
  const [hours, setHours] = useState<HourOption>(24);
  const [now, setNow] = useState(0); // 0 on SSR, set after mount to avoid hydration mismatch

  const fetchData = useCallback(async (id: string, h: number, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [dev, hist] = await Promise.all([
        fetch(`/api/devices/${id}`, { signal }).then((r) => r.json()),
        fetch(`/api/status/${id}?hours=${h}`, { signal }).then((r) => r.json()),
      ]);
      setDevice(dev);
      setHistory(Array.isArray(hist) ? hist : []);

      // Always try to fetch Wi-Fi signal — endpoint matches by MAC (if set) then IP
      fetch(`/api/devices/${id}/wifi-signal`, { signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (!signal?.aborted) setWifiSignal(data ?? null); })
        .catch(() => {});
    } catch (err) {
      // Ignore aborts (param changed mid-flight); only reset on real errors
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setDevice(null); setHistory([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (userRoleProp) { setSessionRole(userRoleProp); return; }
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => setSessionRole((s?.user as { role?: string })?.role ?? null))
      .catch(() => {});
  }, [userRoleProp]);

  useEffect(() => {
    if (!deviceId) { setDevice(null); setHistory([]); return; }
    const controller = new AbortController();
    fetchData(deviceId, hours, controller.signal);
    return () => controller.abort();
  }, [deviceId, hours, fetchData]);

  async function handleTest() {
    if (!deviceId) return;
    setTesting(true);
    await fetch(`/api/devices/${deviceId}/check`, { method: "POST" }).catch(() => {});
    await fetchData(deviceId, hours);
    setTesting(false);
  }

  async function handleAcknowledge() {
    if (!deviceId) return;
    setAcknowledging(true);
    await fetch(`/api/devices/${deviceId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: ackNote.trim() || undefined }),
    }).catch(() => {});
    setAckNote("");
    await fetchData(deviceId, hours);
    setAcknowledging(false);
  }

  async function handleUnacknowledge() {
    if (!deviceId) return;
    setAcknowledging(true);
    await fetch(`/api/devices/${deviceId}/acknowledge`, { method: "DELETE" }).catch(() => {});
    await fetchData(deviceId, hours);
    setAcknowledging(false);
  }

  // ── Computed metrics ────────────────────────────────────────────────────────
  const pings = history.map((h) => h.pingMs).filter((v): v is number => v != null);
  const pingAvg = pings.length > 0 ? Math.round(pings.reduce((s, v) => s + v, 0) / pings.length) : null;
  const pingPeak = pings.length > 0 ? Math.max(...pings) : null;
  const packetLoss = history.length > 0
    ? Math.round((history.filter((h) => !h.isOnline).length / history.length) * 100)
    : 0;
  const onlineChecks = history.filter((h) => h.isOnline).length;
  const uptime24h = history.length > 0
    ? ((onlineChecks / history.length) * 100).toFixed(1)
    : null;

  const status = device?.currentStatus;
  const TypeIcon = device ? DEVICE_TYPE_ICON[device.type] : DEVICE_TYPE_ICON.OTHER;

  const timeLabels = history.map((h) =>
    fmtTime(h.timestamp, { hour: "2-digit", minute: "2-digit" })
  );

  const sparklineData   = history.map((h) => (h.isOnline ? (h.pingMs ?? null) : null));
  const cpuSparkline    = history.map((h) => h.cpuLoad ?? null);
  const memorySparkline = history.map((h) => h.memoryUsed ?? null);

  const segments = useMemo(() => buildSegments(history, now), [history, now]);

  return (
    <Sheet open={deviceId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="sm:max-w-105 w-full p-0 flex flex-col gap-0 overflow-y-auto"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          {loading || !device ? (
            <div className="space-y-2 pr-8">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <Skeleton className="h-5 w-14" />
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${DEVICE_TYPE_ICON_BG[device.type]}`}>
                  <TypeIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[15px] leading-tight truncate">{device.name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{device.ip}</span>
                    {device.location && (
                      <>
                        <span className="opacity-40">·</span>
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span>{device.location}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 space-y-2">
                    <StatusBadge
                      isOnline={status?.isOnline ?? false}
                      acknowledged={!!device.offlineAcknowledgedAt}
                    />

                    {/* Acknowledge section — only for offline devices */}
                    {!status?.isOnline && (sessionRole === "OPERADOR" || sessionRole === "ADMIN") && (
                      <div className="space-y-1.5">
                        {device.offlineAcknowledgedAt ? (
                          <div className="space-y-1">
                            {device.offlineAcknowledgedNote && (
                              <p className="text-[11px] text-muted-foreground italic leading-snug">
                                &ldquo;{device.offlineAcknowledgedNote}&rdquo;
                              </p>
                            )}
                            <button
                              onClick={handleUnacknowledge}
                              disabled={acknowledging}
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                            >
                              <Undo2 className="h-3 w-3" />
                              Remover reconhecimento
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={ackNote}
                              onChange={(e) => setAckNote(e.target.value)}
                              placeholder="Motivo (opcional)"
                              className="w-full text-[11px] px-2 py-1 rounded-md border border-border bg-muted/40 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                              onClick={handleAcknowledge}
                              disabled={acknowledging}
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              <CheckCheck className="h-3 w-3" />
                              Reconhecer offline
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar painel"
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 px-5 py-5 space-y-5">

          {/* Metrics 2×2 */}
          <div className="grid grid-cols-2 gap-2.5">
            <MetricTile label="Ping atual"       value={status?.pingMs ?? null} unit="ms" loading={loading} />
            <MetricTile label="Ping médio"        value={pingAvg}               unit="ms" loading={loading} />
            <MetricTile label="Pico"              value={pingPeak}              unit="ms" loading={loading} />
            <MetricTile label="Perda de pacote"   value={`${packetLoss}%`}      loading={loading} />
          </div>

          {/* Wi-Fi signal tile — only when device has MAC and AP data is available */}
          {device?.macAddress && wifiSignal && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                  Sinal Wi-Fi
                </p>
                <span className="ml-auto text-[10px] text-muted-foreground/70 truncate max-w-35">
                  via {wifiSignal.apName}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* RSSI */}
                <div className="rounded-lg bg-background border border-border p-2.5 space-y-0.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">RSSI</p>
                  <p className={`text-xl font-extrabold leading-none tabular-nums ${
                    wifiSignal.signal == null ? "text-muted-foreground" :
                    wifiSignal.signal >= -65 ? "text-success" :
                    wifiSignal.signal >= -75 ? "text-warning" : "text-destructive"
                  }`}>
                    {wifiSignal.signal != null ? wifiSignal.signal : "—"}
                    {wifiSignal.signal != null && <span className="text-xs font-normal ml-0.5 text-muted-foreground">dBm</span>}
                  </p>
                </div>
                {/* SNR or SSID */}
                {wifiSignal.snr != null ? (
                  <div className="rounded-lg bg-background border border-border p-2.5 space-y-0.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">SNR</p>
                    <p className={`text-xl font-extrabold leading-none tabular-nums ${
                      wifiSignal.snr >= 25 ? "text-success" :
                      wifiSignal.snr >= 15 ? "text-warning" : "text-destructive"
                    }`}>
                      {wifiSignal.snr}
                      <span className="text-xs font-normal ml-0.5 text-muted-foreground">dB</span>
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg bg-background border border-border p-2.5 space-y-0.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">SSID</p>
                    <p className="text-sm font-bold leading-tight truncate">{wifiSignal.ssid ?? "—"}</p>
                  </div>
                )}
              </div>
              {/* Band + SSID row */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                {wifiSignal.ssid && wifiSignal.snr != null && (
                  <span>SSID: <span className="text-foreground font-medium">{wifiSignal.ssid}</span></span>
                )}
                {wifiSignal.band && (
                  <span>Banda: <span className="text-foreground font-medium">{wifiSignal.band}</span></span>
                )}
              </div>
            </div>
          )}

          {/* Latency chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                Latência
              </p>
              <div className="flex items-center gap-0.5">
                {HOUR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setHours(opt.value)}
                    className={`px-2 h-5 rounded text-[10px] font-semibold transition-colors ${
                      hours === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : sparklineData.length >= 3 ? (
              <div className="w-full rounded-xl overflow-hidden border border-border bg-muted/20 px-2 pt-2 pb-1">
                <PingSparkline
                  data={sparklineData}
                  labels={timeLabels}
                  uid={`drawer-${deviceId}`}
                  responsive
                  width={380}
                  height={88}
                  showTooltip
                />
              </div>
            ) : (
              <div className="h-24 rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Sem dados para o período</p>
              </div>
            )}
          </div>

          {/* CPU + Memory charts — Mikrotik/SNMP/RouterOS only */}
          {device && (device.snmpEnabled || device.routerosEnabled) && (
            <>
              <div className="space-y-2">
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                  CPU (%)
                </p>
                {loading ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : cpuSparkline.some((v) => v !== null) && cpuSparkline.length >= 3 ? (
                  <div className="w-full rounded-xl overflow-hidden border border-border bg-muted/20 px-2 pt-2 pb-1">
                    <PingSparkline
                      data={cpuSparkline}
                      labels={timeLabels}
                      uid={`drawer-cpu-${deviceId}`}
                      threshold={80}
                      responsive
                      width={380}
                      height={88}
                      showTooltip
                      unit="%"
                      decimals={2}
                    />
                  </div>
                ) : (
                  <div className="h-24 rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">Sem dados para o período</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
                  Memória (%)
                </p>
                {loading ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : memorySparkline.some((v) => v !== null) && memorySparkline.length >= 3 ? (
                  <div className="w-full rounded-xl overflow-hidden border border-border bg-muted/20 px-2 pt-2 pb-1">
                    <PingSparkline
                      data={memorySparkline}
                      labels={timeLabels}
                      uid={`drawer-mem-${deviceId}`}
                      threshold={80}
                      responsive
                      width={380}
                      height={88}
                      showTooltip
                      unit="%"
                      decimals={2}
                    />
                  </div>
                ) : (
                  <div className="h-24 rounded-xl border border-border bg-muted/20 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground">Sem dados para o período</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Availability bar */}
          <div className="space-y-2">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground">
              Disponibilidade (24h)
            </p>
            {loading ? (
              <Skeleton className="h-5 w-full rounded" />
            ) : (
              <TooltipProvider>
                <div className="flex gap-0.5">
                  {segments.map((s, i) => {
                    const slotEnd = new Date(now - (47 - i) * 1_800_000);
                    const slotStart = new Date(slotEnd.getTime() - 1_800_000);
                    const fmt = (d: Date) => fmtTime(d, { hour: "2-digit", minute: "2-digit" });
                    const label = `${fmt(slotStart)}–${fmt(slotEnd)} · ${
                      s === "online" ? "Online" : s === "offline" ? "Offline" : s === "degraded" ? "Instável" : "Sem dados"
                    }`;
                    return (
                      <Tooltip key={i}>
                        <TooltipTrigger className="flex-1">
                          <div className={`w-full h-5 rounded-[3px] cursor-default ${SEG_COLOR[s]}`} />
                        </TooltipTrigger>
                        <TooltipContent side="top">{label}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            )}
          </div>

          {/* Device info table */}
          <div className="space-y-0.5">
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Informações do dispositivo
            </p>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex justify-between py-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : device ? (
              <div>
                <InfoRow label="Tipo"              value={DEVICE_TYPE_LABEL[device.type]} />
                <InfoRow label="Endereço IP"       value={device.ip} />
                {device.macAddress && (
                  <InfoRow label="MAC Address"     value={device.macAddress} />
                )}
                {wifiSignal && (
                  <InfoRow label="AP conectado"    value={`${wifiSignal.apName} (${wifiSignal.apIp})`} />
                )}
                {status?.uptime != null && (
                  <InfoRow label="Uptime"          value={formatUptime(status.uptime)} />
                )}
                {uptime24h && (
                  <InfoRow label="Disponibilidade 24h" value={`${uptime24h}%`} />
                )}
                {status?.checkedAt && (
                  <InfoRow
                    label="Última verificação"
                    value={fmtTime(status.checkedAt)}
                    suppressHydration
                  />
                )}
              </div>
            ) : null}
          </div>

        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {device && (
          <div className="px-5 py-4 border-t border-border flex gap-2.5 shrink-0">
            <button
              onClick={handleTest}
              disabled={testing || loading}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Zap className="h-4 w-4" />
              {testing ? "Testando..." : "Testar agora"}
            </button>
            <Link
              href={`/devices/${device.id}`}
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-border bg-background text-foreground text-sm font-semibold hover:bg-muted transition-colors"
            >
              <History className="h-4 w-4" />
              Histórico
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
