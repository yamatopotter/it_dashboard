import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { deviceConfigSchema } from "@/lib/schemas/device";
import { encrypt } from "@/lib/crypto";
import { parseAndValidate } from "@/lib/parse-body";
import { sanitizeDevice } from "@/lib/device-utils";

const deviceTypeSchema = z.enum(["MIKROTIK", "DVR", "CAMERA", "OTHER", "UNIFI_AP"]);

export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const rawType = searchParams.get("type");

  if (rawType !== null) {
    const parsed = deviceTypeSchema.safeParse(rawType);
    if (!parsed.success) {
      return NextResponse.json({ error: "Tipo de dispositivo inválido" }, { status: 400 });
    }
  }

  const devices = await db.device.findMany({
    where: rawType ? { type: rawType as "MIKROTIK" | "DVR" | "CAMERA" | "OTHER" } : undefined,
    include: { currentStatus: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(devices.map(sanitizeDevice));
});

export const POST = withAuth(async (req: NextRequest) => {
  const body = await parseAndValidate(req, deviceConfigSchema);
  if (!body.ok) return body.response;

  const { routerosUser, routerosPass, unifiApiKey, unifiUser, unifiPass, ...rest } = body.data;

  const device = await db.device.create({
    data: {
      ...rest,
      routerosUserEnc: routerosUser ? encrypt(routerosUser) : null,
      routerosPassEnc: routerosPass ? encrypt(routerosPass) : null,
      unifiApiKeyEnc: unifiApiKey ? encrypt(unifiApiKey) : null,
      unifiUserEnc: unifiUser ? encrypt(unifiUser) : null,
      unifiPassEnc: unifiPass ? encrypt(unifiPass) : null,
    },
  });

  return NextResponse.json(sanitizeDevice(device), { status: 201 });
});
