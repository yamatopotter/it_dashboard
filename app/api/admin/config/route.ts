export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { encrypt, resolveSmtpPassword } from "@/lib/crypto";
import type { SystemConfig } from "@prisma/client";

// .partial(): a tela de retenção e o card de SMTP salvam independentemente,
// cada PUT só envia os campos do card que foi editado.
const configSchema = z.object({
  statusHistoryDays: z.number().int().min(1).max(365),
  linkEventDays: z.number().int().min(1).max(365),
  smtpEnabled: z.boolean(),
  smtpHost: z.string().max(255).nullable(),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().max(255).nullable(),
  smtpPassword: z.string().nullable(), // write-only — encriptado para smtpPasswordEnc, omitido mantém o valor salvo
  smtpFrom: z.string().max(255).nullable(),
  alertEmailTo: z.string().max(500).nullable(),
}).partial();

function sanitizeConfig(config: SystemConfig) {
  const { smtpPasswordEnc, ...rest } = config;
  return { ...rest, hasSmtpPassword: !!resolveSmtpPassword({ smtpPasswordEnc }) };
}

export async function GET() {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, statusHistoryDays: 30, linkEventDays: 90 },
    update: {},
  });

  return NextResponse.json(sanitizeConfig(config));
}

export async function PUT(req: NextRequest) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const result = configSchema.safeParse(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { smtpPassword, ...rest } = result.data;
  const passwordUpdate = smtpPassword !== undefined
    ? { smtpPasswordEnc: smtpPassword ? encrypt(smtpPassword) : null }
    : {};
  const data = { ...rest, ...passwordUpdate };

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, statusHistoryDays: 30, linkEventDays: 90, ...data },
    update: data,
  });

  void writeAudit({ action: "UPDATE", entity: "SystemConfig", entityName: "Configuração do sistema", details: { fields: Object.keys(data) } });
  return NextResponse.json(sanitizeConfig(config));
}
