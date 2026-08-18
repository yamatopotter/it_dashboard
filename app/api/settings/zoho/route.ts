export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";
import { encrypt } from "@/lib/crypto";
import { parseAndValidate } from "@/lib/parse-body";
import { z } from "zod";

const updateSchema = z.object({
  zohoClientId: z.string().min(1).optional().nullable(),
  zohoClientSecret: z.string().min(1).optional().nullable(),
  zohoAccountsUrl: z.string().url().optional(),
  zohoEnabled: z.boolean().optional(),
});

export async function GET(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const config = await db.systemConfig.findUnique({ where: { id: 1 } });
  if (!config) {
    return NextResponse.json({
      zohoEnabled: false,
      zohoClientId: null,
      hasClientSecret: false,
      zohoAccountsUrl: "https://accounts.zoho.com",
    });
  }

  return NextResponse.json({
    zohoEnabled: config.zohoEnabled,
    zohoClientId: config.zohoClientId,
    hasClientSecret: !!config.zohoClientSecretEnc,
    zohoAccountsUrl: config.zohoAccountsUrl,
  });
}

export async function PUT(req: Request) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  const data: any = {};
  if ("zohoClientId" in body.data && body.data.zohoClientId !== undefined) {
    data.zohoClientId = body.data.zohoClientId;
  }
  if ("zohoClientSecret" in body.data && body.data.zohoClientSecret !== undefined) {
    data.zohoClientSecretEnc = body.data.zohoClientSecret ? encrypt(body.data.zohoClientSecret) : null;
  }
  if ("zohoAccountsUrl" in body.data) {
    data.zohoAccountsUrl = body.data.zohoAccountsUrl;
  }
  if ("zohoEnabled" in body.data) {
    data.zohoEnabled = body.data.zohoEnabled;
  }

  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });

  return NextResponse.json({
    zohoEnabled: config.zohoEnabled,
    zohoClientId: config.zohoClientId,
    hasClientSecret: !!config.zohoClientSecretEnc,
    zohoAccountsUrl: config.zohoAccountsUrl,
  });
}
