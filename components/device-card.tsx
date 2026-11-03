"use client";

import Link from "next/link";
import { Panel } from "@/components/tui/panel";
import { DevScope } from "@/components/tui/dev-shell";
import { StatusBadge } from "@/components/status-badge";
import { formatUptime, formatResponseTime, formatPercent, fmtTime } from "@/lib/format";
import { DEVICE_TYPE_LABEL } from "@/lib/device-constants";
import { pctLevel } from "@/lib/tui-format";
import type { Device, DeviceStatus } from "@prisma/client";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

function pingLevel(ms: number | null | undefined): "ok" | "warn" | "crit" | "dim" {
  if (ms == null) return "dim";
  if (ms < 50) return "ok";
  if (ms < 150) return "warn";
  return "crit";
}

/** Barra de uso (classes .bar do bloco .tui) com o percentual sempre ao lado. */
function UsageBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  const lvl = pctLevel(v);
  return (
    <span className="barwrap">
      <span
        className={`bar${lvl === "crit" ? " c" : lvl === "warn" ? " w" : ""}`}
        style={{ "--p": Math.round(v), width: "8ch" } as React.CSSProperties}
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

/** Cartão de dispositivo: painel btop com estado por glifo, ping, CPU/memória em barras e Wi-Fi. */
export function DeviceCard({ device }: { device: DeviceWithStatus }) {
  const status = device.currentStatus;
  const isOnline = status?.isOnline ?? false;
  const level = pingLevel(status?.pingMs);
  const wifiClients =
    device.type === "UNIFI_AP"
      ? ((status?.unifiData as { totalClients?: number } | null)?.totalClients ?? null)
      : device.type === "OMADA_AP"
      ? ((status?.omadaData as { totalClients?: number } | null)?.totalClients ?? null)
      : null;

  return (
    <DevScope>
      <Link href={`/devices/${device.id}`} className="d-card">
        <Panel title={device.name} sub={DEVICE_TYPE_LABEL[device.type]} color={isOnline ? "ok" : "crit"} hot={!isOnline && !device.offlineAcknowledgedAt}>
          <div className="d-stack" style={{ gap: 6, paddingBottom: 0 }}>
            <div className="d-line">
              <StatusBadge isOnline={isOnline} acknowledged={!isOnline && !!device.offlineAcknowledgedAt} />
              <span className="dim">{device.ip}</span>
            </div>
            {device.location ? <div className="dim">{device.location}</div> : null}

            {status ? (
              <>
                <div className="d-line">
                  <span className="k">ping</span>
                  <span className={level}>{formatResponseTime(status.pingMs)}</span>
                </div>
                {status.cpuLoad != null && (
                  <div className="d-line">
                    <span className="k">cpu</span>
                    <UsageBar value={status.cpuLoad} label="CPU" />
                  </div>
                )}
                {status.memoryUsed != null && (
                  <div className="d-line">
                    <span className="k">mem</span>
                    <UsageBar value={status.memoryUsed} label="Memória" />
                  </div>
                )}
                {status.uptime != null && (
                  <div className="d-line">
                    <span className="k">up</span>
                    <span>{formatUptime(status.uptime)}</span>
                  </div>
                )}
                {wifiClients != null && (
                  <div className="d-line">
                    <span className="k">wi-fi</span>
                    <span className="info">
                      {wifiClients} cliente{wifiClients !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {status.checkedAt && (
                  <div className="faint" style={{ fontSize: 11 }} suppressHydrationWarning>
                    verificado às {fmtTime(status.checkedAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                )}
              </>
            ) : (
              <div className="dim">◌ sem dados de monitoramento</div>
            )}
          </div>
        </Panel>
      </Link>
    </DevScope>
  );
}
