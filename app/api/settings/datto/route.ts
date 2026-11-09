export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";
import { encrypt } from "@/lib/crypto";
import { parseAndValidate } from "@/lib/parse-body";
import { z } from "zod";
import { requireModule } from "@/lib/module-config";

const updateSchema = z.object({
  dattoPlatform: z.string().min(1).max(50).optional().nullable(),
  dattoApiKey: z.string().min(1).optional().nullable(),
  dattoSecretKey: z.string().min(1).optional().nullable(),
  dattoSyncEnabled: z.boolean().optional(),
  dattoSyncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
  dattoSiteFilter: z.string().min(1).max(200).optional().nullable(),
});

export async function GET(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;
  const off = await requireModule("computers");
  if (off) return off;

  const config = await db.systemConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    return NextResponse.json({
      dattoPlatform: null,
      hasApiKey: false,
      hasSecretKey: false,
      dattoSyncEnabled: false,
      dattoSyncIntervalMinutes: 30,
      dattoLastSyncAt: null,
      dattoLastSyncError: null,
      dattoSiteFilter: null,
    });
  }

  return NextResponse.json({
    dattoPlatform: config.dattoPlatform,
    hasApiKey: !!config.dattoApiKeyEnc,
    hasSecretKey: !!config.dattoSecretKeyEnc,
    dattoSyncEnabled: config.dattoSyncEnabled,
    dattoSyncIntervalMinutes: config.dattoSyncIntervalMinutes,
    dattoLastSyncAt: config.dattoLastSyncAt,
    dattoLastSyncError: config.dattoLastSyncError,
    dattoSiteFilter: config.dattoSiteFilter,
  });
}

export async function PUT(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;
  const off = await requireModule("computers");
  if (off) return off;

  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  const data: any = {};
  if ("dattoPlatform" in body.data && body.data.dattoPlatform !== undefined) {
    data.dattoPlatform = body.data.dattoPlatform;
  }
  if ("dattoApiKey" in body.data && body.data.dattoApiKey !== undefined) {
    data.dattoApiKeyEnc = body.data.dattoApiKey ? encrypt(body.data.dattoApiKey) : null;
  }
  if ("dattoSecretKey" in body.data && body.data.dattoSecretKey !== undefined) {
    data.dattoSecretKeyEnc = body.data.dattoSecretKey ? encrypt(body.data.dattoSecretKey) : null;
  }
  if ("dattoSyncEnabled" in body.data) {
    data.dattoSyncEnabled = body.data.dattoSyncEnabled;
  }
  if ("dattoSyncIntervalMinutes" in body.data) {
    data.dattoSyncIntervalMinutes = body.data.dattoSyncIntervalMinutes;
  }
  if ("dattoSiteFilter" in body.data) {
    data.dattoSiteFilter = body.data.dattoSiteFilter || null;
  }

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  return NextResponse.json({
    dattoPlatform: config.dattoPlatform,
    hasApiKey: !!config.dattoApiKeyEnc,
    hasSecretKey: !!config.dattoSecretKeyEnc,
    dattoSyncEnabled: config.dattoSyncEnabled,
    dattoSyncIntervalMinutes: config.dattoSyncIntervalMinutes,
    dattoLastSyncAt: config.dattoLastSyncAt,
    dattoLastSyncError: config.dattoLastSyncError,
    dattoSiteFilter: config.dattoSiteFilter,
  });
}
