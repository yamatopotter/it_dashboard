export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, getSessionUsername } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/parse-body";
import { writeAudit, extractIp } from "@/lib/audit";
import { notFoundOnP2025 } from "@/lib/prisma-error";

/** POST — reconhece um link caído (OPERADOR+). Corpo opcional: { note? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const { id } = await params;
  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;
  const note = typeof (parsed.data as { note?: unknown })?.note === "string"
    ? ((parsed.data as { note: string }).note.trim().slice(0, 500) || null)
    : null;

  try {
    const by = await getSessionUsername();
    const link = await db.link.update({
      where: { id },
      data: { offlineAcknowledgedAt: new Date(), offlineAcknowledgedBy: by, offlineAcknowledgedNote: note },
      select: { id: true, name: true },
    });
    void writeAudit({
      action: "UPDATE", entity: "Link", entityId: id, entityName: link.name,
      ipAddress: extractIp(req), details: { acknowledge: true, note },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/** DELETE — remove o reconhecimento (OPERADOR+) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const { id } = await params;
  try {
    const link = await db.link.update({
      where: { id },
      data: { offlineAcknowledgedAt: null, offlineAcknowledgedBy: null, offlineAcknowledgedNote: null },
      select: { id: true, name: true },
    });
    void writeAudit({
      action: "UPDATE", entity: "Link", entityId: id, entityName: link.name,
      ipAddress: extractIp(req), details: { acknowledge: false },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return notFoundOnP2025(err) ?? NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
