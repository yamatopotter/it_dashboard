export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  ticketEmailTo: z.string().max(500).optional().nullable(),
  ticketAfterMinutes: z.number().int().min(5).max(1440).optional(),
});

const emailSchema = z.string().email();

function serialize(config: { ticketEmailTo?: string | null; ticketAfterMinutes?: number } | null) {
  return {
    ticketEmailTo: config?.ticketEmailTo ?? null,
    ticketAfterMinutes: config?.ticketAfterMinutes ?? 30,
  };
}

export async function GET() {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const config = await db.systemConfig.findUnique({ where: { id: 1 } });
  return NextResponse.json(serialize(config));
}

export async function PUT(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  const data: Record<string, unknown> = {};
  const changed: string[] = [];

  if (body.data.ticketEmailTo !== undefined) {
    const to = body.data.ticketEmailTo?.trim();
    if (to) {
      const recipients = to.split(",").map((r) => r.trim()).filter(Boolean);
      if (recipients.some((r) => !emailSchema.safeParse(r).success)) {
        return NextResponse.json({ error: "Destinatário inválido" }, { status: 400 });
      }
      data.ticketEmailTo = recipients.join(", ");
    } else {
      data.ticketEmailTo = null;
    }
    changed.push("ticketEmailTo");
  }
  if (body.data.ticketAfterMinutes !== undefined) {
    data.ticketAfterMinutes = body.data.ticketAfterMinutes;
    changed.push("ticketAfterMinutes");
  }

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  void writeAudit({ action: "UPDATE", entity: "SystemConfig", entityId: "1", entityName: "Chamado automático", details: { changed } });

  return NextResponse.json(serialize(config));
}
