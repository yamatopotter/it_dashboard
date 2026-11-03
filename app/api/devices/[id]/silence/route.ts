export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/parse-body";
import { writeAudit, extractIp } from "@/lib/audit";
import { notFoundOnP2025 } from "@/lib/prisma-error";
import { parseSilenceMinutes } from "@/lib/problem-actions";

/** POST — silencia (manutenção) por { minutes } (OPERADOR+): define maintenanceUntil. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const { id } = await params;
  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;
  const minutes = parseSilenceMinutes((parsed.data as { minutes?: unknown })?.minutes);
  if (minutes === null) {
    return NextResponse.json({ error: "minutes deve ser inteiro entre 1 e 1440" }, { status: 400 });
  }
  const until = new Date(Date.now() + minutes * 60_000);

  try {
    const row = await db.device.update({
      where: { id },
      data: { maintenanceUntil: until },
      select: { id: true, name: true },
    });
    void writeAudit({
      action: "UPDATE", entity: "Device", entityId: id, entityName: row.name,
      ipAddress: extractIp(req), details: { silenceMinutes: minutes, maintenanceUntil: until.toISOString() },
    });
    return NextResponse.json({ ok: true, maintenanceUntil: until.toISOString() });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** DELETE — encerra o silêncio (OPERADOR+). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const { id } = await params;
  try {
    const row = await db.device.update({
      where: { id },
      data: { maintenanceUntil: null },
      select: { id: true, name: true },
    });
    void writeAudit({
      action: "UPDATE", entity: "Device", entityId: id, entityName: row.name,
      ipAddress: extractIp(req), details: { silence: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
