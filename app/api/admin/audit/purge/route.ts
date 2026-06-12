export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/parse-body";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";

const purgeSchema = z.object({
  olderThanDays: z.number().int().min(30).max(3650),
  confirmation: z.literal("CONFIRMAR"),
});

export async function POST(req: NextRequest) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const result = purgeSchema.safeParse(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const { olderThanDays } = result.data;
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const deleted = await db.auditLog.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  // Log the purge itself — this record is new and will NOT be deleted
  void writeAudit({
    action: "CLEANUP",
    entity: "AuditLog",
    entityName: "Purga de logs de auditoria",
    details: { deletedCount: deleted.count, olderThanDays, cutoff: cutoff.toISOString() },
  });

  return NextResponse.json({ deleted: deleted.count, cutoff: cutoff.toISOString() });
}
