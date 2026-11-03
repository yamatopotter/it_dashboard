export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { writeAudit, extractIp } from "@/lib/audit";
import { getModules } from "@/lib/module-config";
import { MODULE_COLUMN, MODULE_KEYS, modulesFromConfig } from "@/lib/modules";
import { z } from "zod";

const updateSchema = z.object({
  telephony: z.boolean().optional(),
  computers: z.boolean().optional(),
  nvr: z.boolean().optional(),
});

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  return NextResponse.json(await getModules());
}

export async function PUT(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  const data: Record<string, boolean> = {};
  for (const key of MODULE_KEYS) {
    const v = body.data[key];
    if (v !== undefined) data[MODULE_COLUMN[key]] = v;
  }

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  void writeAudit({
    action: "UPDATE",
    entity: "SystemConfig",
    entityId: "1",
    entityName: "Módulos",
    details: { modules: body.data },
    ipAddress: extractIp(req),
  });

  return NextResponse.json(modulesFromConfig(config));
}
