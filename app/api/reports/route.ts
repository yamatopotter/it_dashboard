import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { buildDeviceReport } from "@/lib/report-builder";
import type { DeviceReport } from "@/lib/report-builder";
import { buildAvailabilityReport, DEFAULT_TARGET } from "@/lib/report-availability";
import { monthRange, monthKeyOf } from "@/lib/sla";

export type { AvailabilityReport, AvailabilityLinkRow, AvailabilityUnitRow, AvailabilityDeviceRow } from "@/lib/report-availability";

export type { DeviceReport };
export type { ReportSummary, ReportIncident, ReportPingPoint, ReportRouterosPoint, ReportInsight } from "@/lib/report-builder";

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { searchParams } = new URL(req.url);

  // Modo padrão: relatório mensal de disponibilidade (links + rede/Wi-Fi).
  // O modo por dispositivo (legado, usado pelo ReportView) ativa quando `devices` é enviado.
  if (!searchParams.has("devices")) {
    const now = new Date();
    const range = monthRange(searchParams.get("month") ?? monthKeyOf(now));
    if (!range) return NextResponse.json({ error: "Mês inválido. Use o formato YYYY-MM." }, { status: 400 });
    const targetParam = searchParams.get("target");
    const target = targetParam == null ? DEFAULT_TARGET : Number(targetParam);
    if (!Number.isFinite(target) || target <= 0 || target > 100) {
      return NextResponse.json({ error: "Meta inválida. Use um valor entre 0 e 100." }, { status: 400 });
    }
    return NextResponse.json(await buildAvailabilityReport(range, target, now));
  }

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
