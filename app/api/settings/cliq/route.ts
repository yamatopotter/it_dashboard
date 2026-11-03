export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";
import { encrypt } from "@/lib/crypto";
import { parseAndValidate } from "@/lib/parse-body";
import { validateCliqUrl } from "@/lib/cliq";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  cliqEnabled: z.boolean().optional(),
  cliqWebhookUrl: z.string().max(2000).optional().nullable(),
  cliqChannel: z.string().max(100).optional().nullable(),
  cliqRenotifyMinutes: z.number().int().min(1).max(1440).optional(),
});

function serialize(config: {
  cliqEnabled?: boolean; cliqWebhookUrlEnc?: string | null; cliqChannel?: string | null;
  cliqRenotifyMinutes?: number; cliqLastTestAt?: Date | null; cliqLastError?: string | null;
} | null) {
  return {
    cliqEnabled: config?.cliqEnabled ?? false,
    hasWebhook: !!config?.cliqWebhookUrlEnc,
    cliqChannel: config?.cliqChannel ?? null,
    cliqRenotifyMinutes: config?.cliqRenotifyMinutes ?? 15,
    cliqLastTestAt: config?.cliqLastTestAt ?? null,
    cliqLastError: config?.cliqLastError ?? null,
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

  if (body.data.cliqEnabled !== undefined) {
    data.cliqEnabled = body.data.cliqEnabled;
    changed.push("cliqEnabled");
  }
  if (body.data.cliqWebhookUrl !== undefined) {
    const url = body.data.cliqWebhookUrl?.trim();
    if (url) {
      const invalid = validateCliqUrl(url);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      data.cliqWebhookUrlEnc = encrypt(url);
    } else {
      data.cliqWebhookUrlEnc = null;
    }
    changed.push("cliqWebhookUrl");
  }
  if (body.data.cliqChannel !== undefined) {
    data.cliqChannel = body.data.cliqChannel?.trim() || null;
    changed.push("cliqChannel");
  }
  if (body.data.cliqRenotifyMinutes !== undefined) {
    data.cliqRenotifyMinutes = body.data.cliqRenotifyMinutes;
    changed.push("cliqRenotifyMinutes");
  }

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  // Nunca registra a URL (é um segredo) — apenas quais campos mudaram.
  void writeAudit({ action: "UPDATE", entity: "SystemConfig", entityId: "1", entityName: "Zoho Cliq", details: { changed } });

  return NextResponse.json(serialize(config));
}
