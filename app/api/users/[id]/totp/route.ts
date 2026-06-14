export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { parseBody } from "@/lib/parse-body";
import { generateTotpSecret, getTotpUri, verifyTotp, encryptSecret, decryptSecret } from "@/lib/totp";
import QRCode from "qrcode";
import { writeAudit } from "@/lib/audit";
import { extractIp } from "@/lib/audit";

const verifySchema = z.object({
  token: z.string().length(6, "Token deve ter 6 dígitos"),
});

// GET /api/users/[id]/totp — generate secret + QR code URI (setup flow)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("ADMIN");
  if (unauth) {
    // also allow users to manage their own TOTP
    const session = await auth();
    const { id } = await params;
    if (!session?.user || session.user.id !== id) return unauth;
  }

  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { username: true, totpEnabled: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secret = generateTotpSecret();
  const uri = getTotpUri(user.username, secret);
  const qrDataUrl = await QRCode.toDataURL(uri);

  // Return secret + QR; do NOT save yet — user must verify before enabling
  return NextResponse.json({
    secret,
    qrDataUrl,
    uri,
    alreadyEnabled: user.totpEnabled,
  });
}

// POST /api/users/[id]/totp — verify token and enable TOTP
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("ADMIN");
  const session = await auth();
  const { id } = await params;

  if (unauth && session?.user?.id !== id) return unauth;

  const body = await parseBody(req);
  if (!body.ok) return body.response;

  const parsed = verifySchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const secretRaw = (body.data as Record<string, unknown>).secret;
  if (typeof secretRaw !== "string" || !secretRaw) {
    return NextResponse.json({ error: "secret é obrigatório" }, { status: 400 });
  }

  const valid = await verifyTotp(parsed.data.token, secretRaw);
  if (!valid) return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 422 });

  await db.user.update({
    where: { id },
    data: { totpSecret: encryptSecret(secretRaw), totpEnabled: true },
  });

  void writeAudit({
    action: "UPDATE",
    entity: "User",
    entityId: id,
    entityName: "TOTP habilitado",
    ipAddress: extractIp(req),
    userId: session?.user?.id ?? null,
    username: session?.user?.name ?? null,
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/users/[id]/totp — disable TOTP
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireRole("ADMIN");
  const session = await auth();
  const { id } = await params;

  if (unauth && session?.user?.id !== id) return unauth;

  const body = await parseBody(req);
  if (!body.ok) return body.response;

  const parsed = verifySchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const user = await db.user.findUnique({ where: { id }, select: { totpSecret: true, totpEnabled: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "TOTP não está habilitado" }, { status: 400 });
  }

  const plain = decryptSecret(user.totpSecret);
  const valid = await verifyTotp(parsed.data.token, plain);
  if (!valid) return NextResponse.json({ error: "Token inválido — confirme com seu app autenticador" }, { status: 422 });

  await db.user.update({
    where: { id },
    data: { totpSecret: null, totpEnabled: false },
  });

  void writeAudit({
    action: "UPDATE",
    entity: "User",
    entityId: id,
    entityName: "TOTP desabilitado",
    ipAddress: extractIp(req),
    userId: session?.user?.id ?? null,
    username: session?.user?.name ?? null,
  });

  return NextResponse.json({ ok: true });
}
