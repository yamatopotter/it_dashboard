export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { syncMiradorePhones } from "@/worker/miradore-sync";
import { requireModule } from "@/lib/module-config";

export async function POST(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;
  const off = await requireModule("telephony");
  if (off) return off;

  try {
    await syncMiradorePhones();
    return NextResponse.json({ status: "success", message: "Sincronização iniciada" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ status: "error", message }, { status: 500 });
  }
}
