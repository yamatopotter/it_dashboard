export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import { requireAuth, requireRole, getSessionRole } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { notFoundOnP2025 } from "@/lib/prisma-error";
import { writeAudit } from "@/lib/audit";
import { generateWebhookToken } from "@/lib/webhook";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  mikrotikDeviceId: z.string().optional().nullable(),
  mikrotikInterface: z.string().max(50).optional().nullable(),
  contractedDownloadBps: z.number().int().positive().optional().nullable(),
  contractedUploadBps: z.number().int().positive().optional().nullable(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id } = await params;
  const link = await db.link.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = await getSessionRole();
  const canSeeToken = role === "ADMIN" || role === "OPERADOR";
  return NextResponse.json(canSeeToken ? { ...link, webhookToken: generateWebhookToken(id) } : link);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;
  const { id } = await params;
  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  try {
    const link = await db.link.update({ where: { id }, data: body.data });
    void writeAudit({ action: "UPDATE", entity: "Link", entityId: link.id, entityName: link.name, details: { fields: Object.keys(body.data) } });
    return NextResponse.json(link);
  } catch (err) {
    return notFoundOnP2025(err) ?? (() => { throw err; })();
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;
  const { id } = await params;
  try {
    const link = await db.link.findUnique({ where: { id }, select: { name: true } });
    await db.link.delete({ where: { id } });
    void writeAudit({ action: "DELETE", entity: "Link", entityId: id, entityName: link?.name });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return notFoundOnP2025(err) ?? (() => { throw err; })();
  }
}
