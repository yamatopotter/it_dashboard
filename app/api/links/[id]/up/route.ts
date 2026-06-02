import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function handleUp(id: string) {
  const link = await db.link.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const now = new Date();

  if (!link.isOnline) {
    await db.$transaction([
      db.linkEvent.create({ data: { linkId: id, type: "UP", timestamp: now } }),
      db.link.update({ where: { id }, data: { isOnline: true, lastEventAt: now } }),
    ]);
  }

  return NextResponse.json({ ok: true, status: "up" });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUp(id);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUp(id);
}
