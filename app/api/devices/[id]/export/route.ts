export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.startsWith("=") || str.startsWith("+") || str.startsWith("-") || str.startsWith("@")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const hours = Math.min(Math.max(parseInt(searchParams.get("hours") ?? "720", 10) || 720, 1), 8760);

  const device = await db.device.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db.statusHistory.findMany({
    where: { deviceId: id, timestamp: { gte: since } },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true, isOnline: true, pingMs: true, cpuLoad: true, memoryUsed: true },
  });

  const header = "timestamp,isOnline,pingMs,cpuLoad,memoryUsed\n";
  const body = rows
    .map((r) =>
      [
        escapeCsvField(r.timestamp.toISOString()),
        escapeCsvField(r.isOnline),
        escapeCsvField(r.pingMs),
        escapeCsvField(r.cpuLoad),
        escapeCsvField(r.memoryUsed),
      ].join(",")
    )
    .join("\n");

  const filename = `${device.name.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
