import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modulesFromConfig, type ModuleFlags, type ModuleKey } from "@/lib/modules";

/** Lê as flags de módulos opcionais (SystemConfig id=1). Sem linha = tudo desligado. */
export async function getModules(): Promise<ModuleFlags> {
  const cfg = await db.systemConfig.findUnique({ where: { id: 1 } });
  return modulesFromConfig(cfg);
}

/** Para route handlers: 404 se o módulo estiver desligado, null se liberado. */
export async function requireModule(key: ModuleKey): Promise<NextResponse | null> {
  const modules = await getModules();
  if (!modules[key]) return NextResponse.json({ error: "Módulo desativado" }, { status: 404 });
  return null;
}
