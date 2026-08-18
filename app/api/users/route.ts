export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { parseBody } from "@/lib/parse-body";
import { writeAudit } from "@/lib/audit";

const createSchema = z.discriminatedUnion("authProvider", [
  z.object({
    authProvider: z.literal("LOCAL"),
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/, "Apenas letras, números, _ . -"),
    password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
    role: z.enum(["ADMIN", "OPERADOR", "VIEWER"]),
  }),
  z.object({
    authProvider: z.literal("ZOHO"),
    email: z.string().email("E-mail inválido"),
    role: z.enum(["ADMIN", "OPERADOR", "VIEWER"]),
  }),
]);

export async function GET() {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const users = await db.user.findMany({
    select: { id: true, username: true, email: true, authProvider: true, role: true, totpEnabled: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const result = createSchema.safeParse(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
  }

  const data = result.data;

  if (data.authProvider === "LOCAL") {
    const { username, password, role } = data;

    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "Nome de usuário já existe" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: { username, password: hashed, role, authProvider: "LOCAL" },
      select: { id: true, username: true, email: true, authProvider: true, role: true, totpEnabled: true, createdAt: true },
    });

    void writeAudit({ action: "CREATE", entity: "User", entityId: user.id, entityName: user.username, details: { role, authProvider: "LOCAL" } });
    return NextResponse.json(user, { status: 201 });
  } else {
    const { email, role } = data;

    const existingByEmail = await db.user.findUnique({ where: { email } });
    if (existingByEmail) {
      return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
    }

    const existingByUsername = await db.user.findUnique({ where: { username: email } });
    if (existingByUsername) {
      return NextResponse.json({ error: "E-mail já cadastrado como usuário" }, { status: 409 });
    }

    const user = await db.user.create({
      data: { username: email, email, role, authProvider: "ZOHO" },
      select: { id: true, username: true, email: true, authProvider: true, role: true, totpEnabled: true, createdAt: true },
    });

    void writeAudit({ action: "CREATE", entity: "User", entityId: user.id, entityName: user.username, details: { role, authProvider: "ZOHO" } });
    return NextResponse.json(user, { status: 201 });
  }
}
