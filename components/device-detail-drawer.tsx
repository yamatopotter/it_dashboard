"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { formatUptime, formatResponseTime, formatPercent } from "@/lib/format";
import {
  Router,
  HardDrive,
  Camera,
  Box,
  Pencil,
  ExternalLink,
  Wifi,
  Cpu,
  MemoryStick,
  Clock,
  MapPin,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";
import type { Device, DeviceStatus, StatusHistory, DeviceType } from "@prisma/client";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

const TYPE_ICON: Record<DeviceType, React.ElementType> = {
  MIKROTIK: Router,
  DVR: HardDrive,
  CAMERA: Camera,
  OTHER: Box,
};

const TYPE_LABEL: Record<DeviceType, string> = {
  MIKROTIK: "Mikrotik",
  DVR: "DVR",
  CAMERA: "Câmera",
  OTHER: "Outro",
};

function pingColor(ms: number | null | undefined) {
  if (ms == null) return "text-muted-foreground";
  if (ms < 50) return "text-success";
  if (ms < 150) return "text-warning";
  return "text-destructive";
}

function UptimeBar({ history }: { history: StatusHistory[] }) {
  const now = Date.now();
  const segments = Array.from({ length: 24 }, (_, i) => {
    const segEnd = now - i * 3_600_000;
    const segStart = segEnd - 3_600_000;
    const checks = history.filter((h) => {
      const t = new Date(h.timestamp).getTime();
      return t >= segStart && t < segEnd;
    });
    if (checks.length === 0) return "empty";
    const onlinePct = checks.filter((h) => h.isOnline).length / checks.length;
    if (onlinePct > 0.8) return "online";
    if (onlinePct > 0.2) return "degraded";
    return "offline";
  }).reverse();

  const colorMap: Record<string, string> = {
    online: "bg-success",
    degraded: "bg-warning",
    offline: "bg-destructive",
    empty: "bg-muted",
  };

  const onlineSegments = segments.filter((s) => s === "online").length;
  const totalWithData = segments.filter((s) => s !== "empty").length;
  const uptimePct = totalWithData > 0 ? (onlineSegments / totalWithData) * 100 : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>24h atrás</span>
        {uptimePct !== null && (
          <span className="font-semibold text-foreground">{uptimePct.toFixed(1)}% uptime</span>
        )}
        <span>Agora</span>
      </div>
      <div className="flex gap-[2px]">
        {segments.map((state, i) => (
          <div
            key={i}
            title={`${24 - i}h atrás`}
            className={`flex-1 h-4 rounded-[3px] ${colorMap[state]}`}
          />
        ))}
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-xl bg-muted/50 border border-border/60 p-3 space-y-1">
      <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide ${colorClass}`}>
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-lg font-bold font-mono leading-none">{value}</p>
    </div>
  );
}

interface Props {
  deviceId: string | null;
  onClose: () => void;
}

export function DeviceDetailDrawer({ deviceId, onClose }: Props) {
  const [device, setDevice] = useState<DeviceWithStatus | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!deviceId) {
      setDevice(null);
      setHistory([]);
      return;
    }
    setLoadingData(true);
    Promise.all([
      fetch(`/api/devices/${deviceId}`).then((r) => r.json()),
      fetch(`/api/status/${deviceId}?hours=24`).then((r) => r.json()),
    ]).then(([dev, hist]) => {
      setDevice(dev);
      setHistory(Array.isArray(hist) ? hist : []);
      setLoadingData(false);
    });
  }, [deviceId]);

  const chartData = history
    .filter((h) => h.pingMs != null)
    .map((h) => ({
      time: new Date(h.timestamp).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      ping: h.pingMs,
    }));

  const status = device?.currentStatus;
  const TypeIcon = device ? TYPE_ICON[device.type] : Box;

  return (
    <Sheet open={deviceId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-md w-full flex flex-col gap-0 p-0 overflow-y-auto"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          {loadingData || !device ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : (
            <div className="flex items-start gap-3 pr-7">
              <div className="w-10 h-10 rounded-[10px] bg-accent flex items-center justify-center text-primary shrink-0">
                <TypeIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle className="text-base font-bold leading-tight">
                    {device.name}
                  </SheetTitle>
                  <StatusBadge isOnline={status?.isOnline ?? false} />
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">{device.ip}</span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-accent text-primary text-[10px] font-medium">
                    {TYPE_LABEL[device.type]}
                  </span>
                  {device.location && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5" />
                      {device.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 px-5 py-4 space-y-5">
          {loadingData || !device ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-28 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-2">
                <MetricTile
                  icon={Wifi}
                  label="Ping"
                  value={formatResponseTime(status?.pingMs)}
                  colorClass={pingColor(status?.pingMs)}
                />
                {status?.uptime != null ? (
                  <MetricTile
                    icon={Clock}
                    label="Uptime"
                    value={formatUptime(status.uptime)}
                    colorClass="text-success"
                  />
                ) : (
                  <MetricTile
                    icon={Clock}
                    label="Uptime"
                    value="—"
                    colorClass="text-muted-foreground"
                  />
                )}
                {status?.cpuLoad != null && (
                  <MetricTile
                    icon={Cpu}
                    label="CPU"
                    value={formatPercent(status.cpuLoad)}
                    colorClass={
                      status.cpuLoad < 60
                        ? "text-success"
                        : status.cpuLoad < 85
                        ? "text-warning"
                        : "text-destructive"
                    }
                  />
                )}
                {status?.memoryUsed != null && (
                  <MetricTile
                    icon={MemoryStick}
                    label="Memória"
                    value={formatPercent(status.memoryUsed)}
                    colorClass={
                      status.memoryUsed < 70
                        ? "text-primary"
                        : status.memoryUsed < 90
                        ? "text-warning"
                        : "text-destructive"
                    }
                  />
                )}
              </div>

              {/* Uptime bar */}
              {history.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Disponibilidade 24h
                  </p>
                  <UptimeBar history={history} />
                </div>
              )}

              {/* Sparkline */}
              {chartData.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Latência 24h
                  </p>
                  <div className="h-24 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 2, right: 2, bottom: 0, left: 2 }}
                      >
                        <defs>
                          <linearGradient id="drawerPingGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-popover border rounded-md px-2 py-1.5 text-xs shadow-md">
                                <p className="font-mono font-medium text-primary">
                                  {payload[0].value}ms
                                </p>
                                <p className="text-muted-foreground">{payload[0].payload.time}</p>
                              </div>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="ping"
                          stroke="var(--primary)"
                          strokeWidth={1.5}
                          fill="url(#drawerPingGrad)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Notes */}
              {device.notes && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Observações
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {device.notes}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {device && (
          <div className="px-5 py-4 border-t border-border flex items-center gap-2 shrink-0">
            <Link
              href={`/devices/${device.id}`}
              className={buttonVariants({ size: "sm", className: "flex-1" })}
              onClick={onClose}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Ver detalhes completos
            </Link>
            <Link
              href={`/devices/${device.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={onClose}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
