export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/with-auth";

// Prometheus text format helpers
function gauge(name: string, help: string, value: number, labels: Record<string, string> = {}): string {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`)
    .join(",");
  const metric = labelStr ? `${name}{${labelStr}}` : name;
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${metric} ${value}\n`;
}

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const since24h = new Date(Date.now() - 24 * 3_600_000);

  const [
    devices,
    totalChecks24h,
    onlineChecks24h,
    heartbeat,
    avgPingPerDevice,
  ] = await Promise.all([
    db.device.findMany({
      include: { currentStatus: { select: { isOnline: true, pingMs: true, checkedAt: true } } },
    }),
    db.statusHistory.count({ where: { timestamp: { gte: since24h } } }),
    db.statusHistory.count({ where: { timestamp: { gte: since24h }, isOnline: true } }),
    db.workerHeartbeat.findUnique({ where: { id: 1 } }),
    db.statusHistory.groupBy({
      by: ["deviceId"],
      where: { timestamp: { gte: since24h }, isOnline: true, pingMs: { not: null } },
      _avg: { pingMs: true },
    }),
  ]);

  const onlineCount  = devices.filter((d) => d.currentStatus?.isOnline).length;
  const offlineCount = devices.length - onlineCount;
  const uptimePct    = totalChecks24h > 0 ? (onlineChecks24h / totalChecks24h) * 100 : 100;

  const workerAgeMs = heartbeat ? Date.now() - heartbeat.seenAt.getTime() : -1;

  // Build ping avg map
  const pingAvgMap = new Map(avgPingPerDevice.map((r) => [r.deviceId, r._avg.pingMs ?? 0]));

  const lines: string[] = [
    gauge("watchit_devices_total",   "Total number of monitored devices",         devices.length),
    gauge("watchit_devices_online",  "Number of devices currently online",        onlineCount),
    gauge("watchit_devices_offline", "Number of devices currently offline",       offlineCount),
    gauge("watchit_uptime_pct_24h",  "Overall uptime percentage in the last 24h", uptimePct),
    gauge("watchit_worker_heartbeat_age_seconds", "Seconds since last worker heartbeat (-1 if never seen)", workerAgeMs / 1000),
    "# HELP watchit_device_online Device online status (1=online, 0=offline)\n# TYPE watchit_device_online gauge",
    ...devices.map((d) => {
      const labels = { id: d.id, name: d.name, type: d.type, location: d.location ?? "" };
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .join(",");
      return `watchit_device_online{${labelStr}} ${d.currentStatus?.isOnline ? 1 : 0}`;
    }),
    "\n# HELP watchit_device_ping_avg_ms Average ping latency (ms) in the last 24h\n# TYPE watchit_device_ping_avg_ms gauge",
    ...devices
      .filter((d) => pingAvgMap.has(d.id))
      .map((d) => {
        const labels = { id: d.id, name: d.name };
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
          .join(",");
        return `watchit_device_ping_avg_ms{${labelStr}} ${(pingAvgMap.get(d.id) ?? 0).toFixed(2)}`;
      }),
  ];

  return new NextResponse(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
