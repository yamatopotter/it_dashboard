export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";
import { encrypt } from "@/lib/crypto";
import { parseAndValidate } from "@/lib/parse-body";
import { z } from "zod";

const updateSchema = z.object({
  miradoreSiteName: z.string().min(1).max(100).optional().nullable(),
  miradoreApiKey: z.string().min(1).optional().nullable(),
  miradoreSyncEnabled: z.boolean().optional(),
  miradoreSyncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
});

export async function GET(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const config = await db.systemConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    return NextResponse.json({
      miradoreSiteName: null,
      hasApiKey: false,
      miradoreSyncEnabled: false,
      miradoreSyncIntervalMinutes: 60,
      miradoreLastSyncAt: null,
      miradoreLastSyncError: null,
    });
  }

  return NextResponse.json({
    miradoreSiteName: config.miradoreSiteName,
    hasApiKey: !!config.miradoreApiKeyEnc,
    miradoreSyncEnabled: config.miradoreSyncEnabled,
    miradoreSyncIntervalMinutes: config.miradoreSyncIntervalMinutes,
    miradoreLastSyncAt: config.miradoreLastSyncAt,
    miradoreLastSyncError: config.miradoreLastSyncError,
  });
}

export async function PUT(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  const data: any = {};
  if ("miradoreSiteName" in body.data && body.data.miradoreSiteName !== undefined) {
    data.miradoreSiteName = body.data.miradoreSiteName;
  }
  if ("miradoreApiKey" in body.data && body.data.miradoreApiKey !== undefined) {
    data.miradoreApiKeyEnc = body.data.miradoreApiKey ? encrypt(body.data.miradoreApiKey) : null;
  }
  if ("miradoreSyncEnabled" in body.data) {
    data.miradoreSyncEnabled = body.data.miradoreSyncEnabled;
  }
  if ("miradoreSyncIntervalMinutes" in body.data) {
    data.miradoreSyncIntervalMinutes = body.data.miradoreSyncIntervalMinutes;
  }

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  return NextResponse.json({
    miradoreSiteName: config.miradoreSiteName,
    hasApiKey: !!config.miradoreApiKeyEnc,
    miradoreSyncEnabled: config.miradoreSyncEnabled,
    miradoreSyncIntervalMinutes: config.miradoreSyncIntervalMinutes,
    miradoreLastSyncAt: config.miradoreLastSyncAt,
    miradoreLastSyncError: config.miradoreLastSyncError,
  });
}
