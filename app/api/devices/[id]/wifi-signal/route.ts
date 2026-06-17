export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { notFoundOnP2025 } from "@/lib/prisma-error";

export interface WifiSignalResult {
  signal: number | null;   // RSSI dBm
  snr: number | null;      // SNR dB (Omada only)
  ssid: string | null;
  band: string | null;
  apId: string;
  apName: string;
  apIp: string;
  matchedBy: "mac" | "ip"; // how the client was identified
  updatedAt: string;       // ISO timestamp of the AP's last status check
}

type OmadaClient = {
  mac: string;
  ip?: string | null;
  signal?: number | null;
  snr?: number | null;
  ssid?: string | null;
  band?: string | null;
};

type UnifiClient = {
  mac: string;
  ip?: string | null;
  signal?: number | null;
  ssid?: string | null;
};

/**
 * GET /api/devices/[id]/wifi-signal
 *
 * Matching strategy (in order):
 *   1. MAC address — exact match, most reliable. Used when device.macAddress is set.
 *   2. IP address  — fallback when no MAC is configured. Less reliable (DHCP can reassign IPs),
 *      but good enough for static/reserved IPs.
 *
 * Returns 404 when no AP has the device in its client list.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireRole("VIEWER");
  if (unauth) return unauth;

  const { id } = await params;

  try {
    const device = await db.device.findUnique({
      where: { id },
      select: { macAddress: true, ip: true },
    });

    if (!device) return NextResponse.json({ error: "Dispositivo não encontrado" }, { status: 404 });

    const mac = device.macAddress?.toUpperCase() ?? null;
    const deviceIp = device.ip;

    const aps = await db.device.findMany({
      where: { type: { in: ["UNIFI_AP", "OMADA_AP"] } },
      select: {
        id: true,
        name: true,
        ip: true,
        type: true,
        currentStatus: {
          select: { omadaData: true, unifiData: true, checkedAt: true },
        },
      },
    });

    for (const ap of aps) {
      const status = ap.currentStatus;
      if (!status) continue;
      const updatedAt = status.checkedAt
        ? new Date(status.checkedAt).toISOString()
        : new Date().toISOString();

      // ── Omada AP ──────────────────────────────────────────────────────────
      if (ap.type === "OMADA_AP" && status.omadaData) {
        const clients = (status.omadaData as { clients?: OmadaClient[] }).clients ?? [];

        const byMac = mac ? clients.find((c) => c.mac.toUpperCase() === mac) : null;
        const byIp  = !byMac ? clients.find((c) => c.ip === deviceIp) : null;
        const client = byMac ?? byIp;

        if (client) {
          return NextResponse.json({
            signal: client.signal ?? null,
            snr:    client.snr ?? null,
            ssid:   client.ssid ?? null,
            band:   client.band ?? null,
            apId:   ap.id,
            apName: ap.name,
            apIp:   ap.ip,
            matchedBy: byMac ? "mac" : "ip",
            updatedAt,
          } satisfies WifiSignalResult);
        }
      }

      // ── UniFi AP ──────────────────────────────────────────────────────────
      if (ap.type === "UNIFI_AP" && status.unifiData) {
        const clients = (status.unifiData as { clients?: UnifiClient[] }).clients ?? [];

        const byMac = mac ? clients.find((c) => c.mac.toUpperCase() === mac) : null;
        const byIp  = !byMac ? clients.find((c) => c.ip === deviceIp) : null;
        const client = byMac ?? byIp;

        if (client) {
          return NextResponse.json({
            signal: client.signal ?? null,
            snr:    null,
            ssid:   client.ssid ?? null,
            band:   null,
            apId:   ap.id,
            apName: ap.name,
            apIp:   ap.ip,
            matchedBy: byMac ? "mac" : "ip",
            updatedAt,
          } satisfies WifiSignalResult);
        }
      }
    }

    return NextResponse.json({ error: "Cliente Wi-Fi não encontrado em nenhum AP" }, { status: 404 });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
