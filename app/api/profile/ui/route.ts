export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { writeAudit, extractIp } from "@/lib/audit";
import { UI_KEYS } from "@/lib/modules";
import { z } from "zod";

const schema = z.object({ uiPreference: z.enum(UI_KEYS).nullable() });

export async function PUT(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await parseAndValidate(req, schema);
  if (!body.ok) return body.response;

  const cfg = await db.systemConfig.findUnique({ where: { id: 1 } });
  if (!(cfg?.allowUserUi ?? true)) {
    return NextResponse.json({ error: "Troca de interface desativada pelo administrador" }, { status: 403 });
  }

  await db.user.update({ where: { id: userId }, data: { uiPreference: body.data.uiPreference } });

  void writeAudit({
    action: "UPDATE",
    entity: "User",
    entityId: userId,
    entityName: "Interface",
    details: { uiPreference: body.data.uiPreference },
    ipAddress: extractIp(req),
  });

  return NextResponse.json({ uiPreference: body.data.uiPreference });
}
