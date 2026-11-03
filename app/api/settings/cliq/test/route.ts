export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";
import { decrypt } from "@/lib/crypto";
import { sendCliq } from "@/lib/cliq";
import { writeAudit } from "@/lib/audit";

export async function POST() {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const config = await db.systemConfig.findUnique({ where: { id: 1 } });
  if (!config?.cliqWebhookUrlEnc) {
    return NextResponse.json({ ok: false, error: "Configure a URL do webhook antes de testar." }, { status: 400 });
  }

  let error: string | null = null;
  try {
    await sendCliq(decrypt(config.cliqWebhookUrlEnc), "✅ Mensagem de teste do WatchIT");
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const now = new Date();
  await db.systemConfig.update({
    where: { id: 1 },
    data: { cliqLastTestAt: now, cliqLastError: error },
  });
  void writeAudit({
    action: "UPDATE", entity: "SystemConfig", entityId: "1", entityName: "Zoho Cliq",
    details: { event: "test", ok: !error, ...(error ? { error } : {}) },
  });

  if (error) return NextResponse.json({ ok: false, error, cliqLastTestAt: now }, { status: 502 });
  return NextResponse.json({ ok: true, cliqLastTestAt: now });
}
