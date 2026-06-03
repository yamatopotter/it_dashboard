import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export interface HealthData {
  totalChecks: number;
  onlineChecks: number;
  uptimePct: number;
}

export async function GET() {
  const since = new Date(Date.now() - 24 * 3_600_000);

  const [totalChecks, onlineChecks] = await Promise.all([
    db.statusHistory.count({ where: { timestamp: { gte: since } } }),
    db.statusHistory.count({ where: { timestamp: { gte: since }, isOnline: true } }),
  ]);

  const uptimePct = totalChecks > 0 ? (onlineChecks / totalChecks) * 100 : 100;

  return NextResponse.json({ totalChecks, onlineChecks, uptimePct });
}
