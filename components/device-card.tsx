"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { DeviceTypeBadge } from "@/components/device-type-badge";
import { formatUptime, formatResponseTime, formatPercent } from "@/lib/format";
import { MapPin, Clock, Cpu, MemoryStick } from "lucide-react";
import type { Device, DeviceStatus } from "@prisma/client";

type DeviceWithStatus = Device & { currentStatus: DeviceStatus | null };

export function DeviceCard({ device }: { device: DeviceWithStatus }) {
  const status = device.currentStatus;
  const isOnline = status?.isOnline ?? false;

  return (
    <Link href={`/devices/${device.id}`}>
      <Card
        className={`h-full transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer border-l-4 ${
          isOnline ? "border-l-success" : "border-l-destructive"
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{device.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{device.ip}</p>
            </div>
            <StatusBadge isOnline={isOnline} />
          </div>
          <div className="flex flex-wrap gap-1">
            <DeviceTypeBadge type={device.type} />
            {device.location && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {device.location}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">Ping</span>
            </div>
            <span className="text-xs font-mono text-right">
              {formatResponseTime(status?.pingMs)}
            </span>

            {status?.uptime != null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">Uptime</span>
                </div>
                <span className="text-xs font-mono text-right">
                  {formatUptime(status.uptime)}
                </span>
              </>
            )}

            {status?.cpuLoad != null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" />
                  <span className="text-xs">CPU</span>
                </div>
                <span className="text-xs font-mono text-right">
                  {formatPercent(status.cpuLoad)}
                </span>
              </>
            )}

            {status?.memoryUsed != null && (
              <>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MemoryStick className="h-3.5 w-3.5" />
                  <span className="text-xs">Memória</span>
                </div>
                <span className="text-xs font-mono text-right">
                  {formatPercent(status.memoryUsed)}
                </span>
              </>
            )}
          </div>

          {status?.checkedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Verificado{" "}
              {new Date(status.checkedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
