export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { notFoundOnP2025 } from "@/lib/prisma-error";
import { writeAudit } from "@/lib/audit";
import { phoneUpdateSchema } from "@/lib/schemas/phone";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id } = await params;
  const phone = await db.phone.findUnique({ where: { id } });
  if (!phone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(phone);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;
  const { id } = await params;
  const body = await parseAndValidate(req, phoneUpdateSchema);
  if (!body.ok) return body.response;

  try {
    const phone = await db.phone.update({ where: { id }, data: body.data });
    void writeAudit({
      action: "UPDATE",
      entity: "Phone",
      entityId: phone.id,
      entityName: phone.phoneNumber,
      details: { fields: Object.keys(body.data) },
    });
    return NextResponse.json(phone);
  } catch (err) {
    return notFoundOnP2025(err) ?? (() => { throw err; })();
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;
  const { id } = await params;
  try {
    const phone = await db.phone.findUnique({ where: { id }, select: { phoneNumber: true } });
    await db.phone.delete({ where: { id } });
    void writeAudit({ action: "DELETE", entity: "Phone", entityId: id, entityName: phone?.phoneNumber });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return notFoundOnP2025(err) ?? (() => { throw err; })();
  }
}
