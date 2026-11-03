export const dynamic = "force-dynamic";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { buildTowerSnapshot } from "@/lib/tower-snapshot";

// Cache em memória de 3 s (instância única, mesma premissa de /api/overview): várias abas/interfaces
// fazendo polling ao mesmo tempo compartilham a mesma montagem do snapshot.
const CACHE_TTL_MS = 3_000;
let cache: { body: string; etag: string; expiresAt: number } | null = null;

export function resetTowerCache() { cache = null; }

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const now = Date.now();
  if (!cache || now >= cache.expiresAt) {
    const body = JSON.stringify(await buildTowerSnapshot());
    // generatedAt muda a cada montagem; o ETag ignora-o para que dados iguais gerem 304.
    const stable = body.replace(/"generatedAt":"[^"]*"/, "");
    const etag = `"${createHash("sha1").update(stable).digest("hex")}"`;
    cache = { body, etag, expiresAt: now + CACHE_TTL_MS };
  }

  const headers = { "Cache-Control": "no-store", ETag: cache.etag };
  if (req.headers.get("if-none-match") === cache.etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(cache.body, { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
}
