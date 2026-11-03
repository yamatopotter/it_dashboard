export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { writeAudit, extractIp } from "@/lib/audit";
import { DEFAULT_UI, UI_KEYS, isUiKey } from "@/lib/modules";
import { z } from "zod";

const updateSchema = z.object({
  defaultUi: z.enum(UI_KEYS).optional(),
  allowUserUi: z.boolean().optional(),
});

function shape(cfg: { defaultUi?: string | null; allowUserUi?: boolean | null } | null) {
  return {
    defaultUi: isUiKey(cfg?.defaultUi) ? cfg!.defaultUi : DEFAULT_UI,
    allowUserUi: cfg?.allowUserUi ?? true,
  };
}

export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  return NextResponse.json(shape(await db.systemConfig.findUnique({ where: { id: 1 } })));
}

export async function PUT(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  const data: { defaultUi?: string; allowUserUi?: boolean } = {};
  if (body.data.defaultUi !== undefined) data.defaultUi = body.data.defaultUi;
  if (body.data.allowUserUi !== undefined) data.allowUserUi = body.data.allowUserUi;

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  void writeAudit({
    action: "UPDATE",
    entity: "SystemConfig",
    entityId: "1",
    entityName: "Aparência",
    details: { appearance: body.data },
    ipAddress: extractIp(req),
  });

  return NextResponse.json(shape(config));
}
