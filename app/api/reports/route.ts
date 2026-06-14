import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { buildDeviceReport } from "@/lib/report-builder";
import type { DeviceReport } from "@/lib/report-builder";

export type { DeviceReport };
export type { ReportSummary, ReportIncident, ReportPingPoint, ReportRouterosPoint, ReportInsight } from "@/lib/report-builder";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { searchParams } = new URL(req.url);
  const deviceIds = (searchParams.get("devices") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "") || 168, 720);

  if (deviceIds.length === 0) {
    return NextResponse.json({ error: "Selecione pelo menos um dispositivo." }, { status: 400 });
  }
  if (deviceIds.length > 10) {
    return NextResponse.json({ error: "Máximo de 10 dispositivos por relatório." }, { status: 400 });
  }

  const since = new Date(Date.now() - hours * 3_600_000);
  const now = new Date();

  const compareFromParam = searchParams.get("compareFrom");
  const compareToParam   = searchParams.get("compareTo");
  let compareSince: Date | undefined;
  let compareTo: Date | undefined;

  if (compareFromParam && compareToParam) {
    const cf = new Date(compareFromParam);
    const ct = new Date(compareToParam);
    if (!isNaN(cf.getTime()) && !isNaN(ct.getTime()) && cf < ct) {
      compareSince = cf;
      compareTo = ct;
    }
  } else if (compareFromParam === "auto") {
    compareTo = since;
    compareSince = new Date(since.getTime() - hours * 3_600_000);
  }

  const reports = await Promise.all(
    deviceIds.map(id => buildDeviceReport(id, since, now, hours, compareSince, compareTo))
  );
  return NextResponse.json(reports.filter(Boolean) as DeviceReport[]);
}
