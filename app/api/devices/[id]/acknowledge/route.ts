export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/parse-body";
import { writeAudit, extractIp } from "@/lib/audit";
import { notFoundOnP2025 } from "@/lib/prisma-error";

/** POST — acknowledge an offline device (OPERADOR+) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const { id } = await params;
  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const { note } = parsed.data as { note?: string };

  try {
    const device = await db.device.update({
      where: { id },
      data: {
        offlineAcknowledgedAt:   new Date(),
        offlineAcknowledgedNote: note?.trim() || null,
      },
      select: { id: true, name: true },
    });

    void writeAudit({
      action: "UPDATE",
      entity: "Device",
      entityId: id,
      entityName: device.name,
      ipAddress: extractIp(req),
      details: { acknowledge: true, note: note?.trim() || null },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** DELETE — remove acknowledgement (OPERADOR+) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const { id } = await params;

  try {
    const device = await db.device.update({
      where: { id },
      data: {
        offlineAcknowledgedAt:   null,
        offlineAcknowledgedNote: null,
      },
      select: { id: true, name: true },
    });

    void writeAudit({
      action: "UPDATE",
      entity: "Device",
      entityId: id,
      entityName: device.name,
      ipAddress: extractIp(req),
      details: { acknowledge: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
