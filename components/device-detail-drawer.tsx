"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatUptime, fmtTime } from "@/lib/format";
import { DEVICE_TYPE_LABEL } from "@/lib/device-constants";
import { Panel } from "@/components/tui/panel";
import { DevScope } from "@/components/tui/dev-shell";
import { StatusBadge } from "@/components/status-badge";
import type { WifiSignalResult } from "@/app/api/devices/[id]/wifi-signal/route";
import { resolveSnmpOids } from "@/lib/snmp-defaults";
import { PingSparkline } from "@/components/ping-sparkline";
import type { Device, DeviceStatus, StatusHistory } from "@prisma/client";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

// ─── Segmentos de disponibilidade ────────────────────────────────────────────

type Seg = "online" | "offline" | "degraded" | "empty";

function buildSegments(history: StatusHistory[], now: number): Seg[] {
  return Array.from({ length: 48 }, (_, i) => {
    const segEnd = now - i * 1_800_000;          // fatias de 30 min
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

// ─── Peças ───────────────────────────────────────────────────────────────────

function Tile({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="d-tile">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function Unit({ v, unit }: { v: number | string | null; unit?: string }) {
  if (v == null) return <>—</>;
  return <>{v}{unit ? <span className="u">{unit}</span> : null}</>;
}

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

/** Painel lateral de detalhe do dispositivo, no estilo TUI (painéis com título na borda). */
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
  const [now, setNow] = useState(0); // 0 no SSR; definido após montar para evitar divergência de hidratação

  const fetchData = useCallback(async (id: string, h: number, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [dev, hist] = await Promise.all([
        fetch(`/api/devices/${id}`, { signal }).then((r) => r.json()),
        fetch(`/api/status/${id}?hours=${h}`, { signal }).then((r) => r.json()),
      ]);
      setDevice(dev);
      setHistory(Array.isArray(hist) ? hist : []);

      // Sempre tenta o sinal Wi-Fi — o endpoint casa por MAC (se houver) e depois por IP
      fetch(`/api/devices/${id}/wifi-signal`, { signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (!signal?.aborted) setWifiSignal(data ?? null); })
        .catch(() => {});
    } catch (err) {
      // Aborts (parâmetro mudou no meio do voo) são ignorados; só reseta em erro real
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

  // ── Métricas calculadas ─────────────────────────────────────────────────────
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

  const timeLabels = history.map((h) =>
    fmtTime(h.timestamp, { hour: "2-digit", minute: "2-digit" })
  );

  const sparklineData   = history.map((h) => (h.isOnline ? (h.pingMs ?? null) : null));
  const cpuSparkline    = history.map((h) => h.cpuLoad ?? null);
  const memorySparkline = history.map((h) => h.memoryUsed ?? null);

  const segments = useMemo(() => buildSegments(history, now), [history, now]);

  const rssiCls = wifiSignal?.signal == null ? "dim" : wifiSignal.signal >= -65 ? "ok" : wifiSignal.signal >= -75 ? "warn" : "crit";
  const snrCls = wifiSignal?.snr == null ? "dim" : wifiSignal.snr >= 25 ? "ok" : wifiSignal.snr >= 15 ? "warn" : "crit";
  const canAck = sessionRole === "OPERADOR" || sessionRole === "ADMIN";

  const chart = (title: string, values: (number | null)[], uid: string) => (
    <Panel title={title} color="info">
      {loading ? (
        <div className="d-skel" style={{ height: 60 }} />
      ) : values.some((v) => v !== null) && values.length >= 3 ? (
        <PingSparkline
          data={values}
          labels={timeLabels}
          uid={uid}
          threshold={80}
          responsive
          width={380}
          height={88}
          showTooltip
          unit="%"
          decimals={2}
        />
      ) : (
        <div className="dim">◌ sem dados para o período</div>
      )}
    </Panel>
  );

  return (
    <Sheet open={deviceId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-label="Detalhe do dispositivo"
        className="sm:max-w-130 w-full p-0 flex flex-col gap-0 overflow-y-auto bg-background"
      >
        <DevScope className="d-drawer">
          <div style={{ padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 18, minHeight: "100%" }}>
            {/* ── Estado ─────────────────────────────────────────────── */}
            <Panel
              title={loading || !device ? "carregando…" : device.name}
              sub={device ? DEVICE_TYPE_LABEL[device.type] : undefined}
              color={status?.isOnline ? "ok" : "crit"}
              hot={!!device && !status?.isOnline && !device.offlineAcknowledgedAt}
              right={<button type="button" onClick={onClose} aria-label="Fechar painel"><kbd>esc</kbd> fechar</button>}
            >
              {loading || !device ? (
                <div className="d-skel" style={{ height: 40 }} role="status" aria-label="Carregando" />
              ) : (
                <div className="d-stack" style={{ gap: 6, paddingBottom: 0 }}>
                  <div className="d-line">
                    <StatusBadge isOnline={status?.isOnline ?? false} acknowledged={!!device.offlineAcknowledgedAt} />
                    <span className="dim">{device.ip}</span>
                    {device.location ? <span className="dim">· {device.location}</span> : null}
                  </div>

                  {/* Reconhecimento — só para dispositivos offline e perfis com permissão */}
                  {!status?.isOnline && canAck && (
                    device.offlineAcknowledgedAt ? (
                      <div className="d-stack" style={{ gap: 4, paddingBottom: 0 }}>
                        {device.offlineAcknowledgedNote && (
                          <div className="dim">&ldquo;{device.offlineAcknowledgedNote}&rdquo;</div>
                        )}
                        <div>
                          <button type="button" className="btn" onClick={handleUnacknowledge} disabled={acknowledging}>
                            remover reconhecimento
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="btns">
                        <input
                          type="text"
                          aria-label="Motivo do reconhecimento (opcional)"
                          value={ackNote}
                          onChange={(e) => setAckNote(e.target.value)}
                          placeholder="motivo (opcional)"
                          className="d-in"
                          style={{ width: "auto", flex: 1, minWidth: "16ch" }}
                        />
                        <button type="button" className="btn" onClick={handleAcknowledge} disabled={acknowledging}>
                          reconhecer offline
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </Panel>

            {/* ── Latência ────────────────────────────────────────────── */}
            <Panel
              title="latência"
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
              <div className="d-tiles" style={{ marginBottom: 10 }}>
                <Tile k="ping atual" v={loading ? "…" : <Unit v={status?.pingMs ?? null} unit="ms" />} />
                <Tile k="médio" v={loading ? "…" : <Unit v={pingAvg} unit="ms" />} />
                <Tile k="pico" v={loading ? "…" : <Unit v={pingPeak} unit="ms" />} />
                <Tile k="perda" v={loading ? "…" : `${packetLoss}%`} />
              </div>
              {loading ? (
                <div className="d-skel" style={{ height: 60 }} />
              ) : sparklineData.length >= 3 ? (
                <PingSparkline
                  data={sparklineData}
                  labels={timeLabels}
                  uid={`drawer-${deviceId}`}
                  responsive
                  width={380}
                  height={88}
                  showTooltip
                />
              ) : (
                <div className="dim">◌ sem dados para o período</div>
              )}
            </Panel>

            {device?.macAddress && wifiSignal && (
              <Panel title="sinal wi-fi" sub={`via ${wifiSignal.apName}`} color="accent2">
                <div className="d-tiles">
                  <Tile
                    k="rssi"
                    v={<span className={rssiCls}><Unit v={wifiSignal.signal} unit={wifiSignal.signal != null ? "dBm" : undefined} /></span>}
                  />
                  {wifiSignal.snr != null ? (
                    <Tile k="snr" v={<span className={snrCls}><Unit v={wifiSignal.snr} unit="dB" /></span>} />
                  ) : (
                    <Tile k="ssid" v={<span style={{ fontSize: 14 }}>{wifiSignal.ssid ?? "—"}</span>} />
                  )}
                </div>
                <div className="dim" style={{ marginTop: 6 }}>
                  {wifiSignal.ssid && wifiSignal.snr != null && <span>SSID {wifiSignal.ssid} </span>}
                  {wifiSignal.band && <span>· banda {wifiSignal.band}</span>}
                </div>
              </Panel>
            )}

            {device && (device.snmpEnabled || device.routerosEnabled) && (
              <>
                {chart("cpu (%)", cpuSparkline, `drawer-cpu-${deviceId}`)}
                {chart("memória (%)", memorySparkline, `drawer-mem-${deviceId}`)}
              </>
            )}

            {/* Métricas SNMP personalizadas (cpu/memória/uptime têm gráfico próprio) */}
            {device?.snmpEnabled && status?.snmpData && (() => {
              const snmpData = status.snmpData as Record<string, number | null>;
              const oidConfig = resolveSnmpOids(device.snmpCustomOids);
              const customMetrics = oidConfig.filter(
                (e) => e.enabled && !["cpu", "memory", "uptime"].includes(e.key) && snmpData[e.key] != null
              );
              if (customMetrics.length === 0) return null;
              return (
                <Panel title="métricas snmp" color="accent2">
                  <div className="d-tiles">
                    {customMetrics.map((entry) => {
                      const val = snmpData[entry.key];
                      const display = val != null ? `${Number(val).toFixed(entry.unit === "%" ? 1 : 0)}` : "—";
                      return (
                        <Tile
                          key={entry.key}
                          k={entry.label}
                          v={<Unit v={display} unit={val != null && entry.unit ? entry.unit : undefined} />}
                        />
                      );
                    })}
                  </div>
                </Panel>
              );
            })()}

            {/* Disponibilidade 24h em fatias de 30 min */}
            <Panel title="disponibilidade" sub="24h" color="ok">
              {loading ? (
                <div className="d-skel" />
              ) : (
                <>
                  <div className="d-segs" role="img" aria-label={`Disponibilidade nas últimas 24 horas${uptime24h ? `: ${uptime24h}%` : ""}`}>
                    {segments.map((s, i) => {
                      const slotEnd = new Date(now - (47 - i) * 1_800_000);
                      const slotStart = new Date(slotEnd.getTime() - 1_800_000);
                      const fmt = (d: Date) => fmtTime(d, { hour: "2-digit", minute: "2-digit" });
                      const label = `${fmt(slotStart)}–${fmt(slotEnd)} · ${
                        s === "online" ? "Online" : s === "offline" ? "Offline" : s === "degraded" ? "Instável" : "Sem dados"
                      }`;
                      return <i key={i} className={s} title={label} />;
                    })}
                  </div>
                  <div className="dim" style={{ marginTop: 4, fontSize: 11 }}>
                    <span className="ok">●</span> online <span className="warn">▲</span> instável <span className="crit">✖</span> offline ░ sem dados
                  </div>
                </>
              )}
            </Panel>

            <Panel title="informações" color="dim">
              {loading ? (
                <div className="d-skel" style={{ height: 70 }} />
              ) : device ? (
                <dl className="kv" style={{ gridTemplateColumns: "18ch 1fr" }}>
                  <dt>Tipo</dt><dd>{DEVICE_TYPE_LABEL[device.type]}</dd>
                  <dt>Endereço IP</dt><dd>{device.ip}</dd>
                  {device.macAddress && (<><dt>MAC</dt><dd>{device.macAddress}</dd></>)}
                  {wifiSignal && (<><dt>AP conectado</dt><dd>{wifiSignal.apName} ({wifiSignal.apIp})</dd></>)}
                  {status?.uptime != null && (<><dt>Uptime</dt><dd>{formatUptime(status.uptime)}</dd></>)}
                  {uptime24h && (<><dt>Disponib. 24h</dt><dd>{uptime24h}%</dd></>)}
                  {status?.checkedAt && (<><dt>Última verif.</dt><dd suppressHydrationWarning>{fmtTime(status.checkedAt)}</dd></>)}
                </dl>
              ) : null}
            </Panel>

            {/* ── Rodapé ──────────────────────────────────────────────── */}
            {device && (
              <div className="foot">
                <button type="button" className="btn pri" onClick={handleTest} disabled={testing || loading}>
                  {testing ? "testando…" : "testar agora"}
                </button>
                <Link href={`/devices/${device.id}`} onClick={onClose} className="btn">
                  histórico
                </Link>
                <Link href={`/devices/${device.id}/edit`} onClick={onClose} className="btn">
                  editar
                </Link>
              </div>
            )}
          </div>
        </DevScope>
      </SheetContent>
    </Sheet>
  );
}
