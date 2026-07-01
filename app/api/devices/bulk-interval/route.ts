import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { parseAndValidate } from "@/lib/parse-body";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  interval: z.number().int().min(10).max(3600),
  type: z.enum(["MIKROTIK", "DVR", "CAMERA", "OTHER", "UNIFI_AP", "OMADA_AP"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, schema);
  if (!body.ok) return body.response;

  const { interval, type } = body.data;
  const where = type ? { type } : undefined;

  const { count } = await db.device.updateMany({ where, data: { checkInterval: interval } });

  void writeAudit({
    action: "UPDATE",
    entity: "Device",
    entityName: "bulk-interval",
    details: { interval, type: type ?? "all", count },
  });

  return NextResponse.json({ ok: true, count });
}
