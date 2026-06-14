export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let ip: string;
  try {
    const body = await req.json() as { ip?: unknown };
    if (typeof body.ip !== "string" || !body.ip) {
      return NextResponse.json({ error: "ip required" }, { status: 400 });
    }
    ip = body.ip;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date();
  const existing = await db.rateLimit.findUnique({ where: { ip } });

  let count: number;

  if (!existing || existing.resetAt <= now) {
    // New IP or expired window — start fresh
    const windowEnd = new Date(now.getTime() + WINDOW_MS);
    await db.rateLimit.upsert({
      where: { ip },
      update: { count: 1, resetAt: windowEnd },
      create: { ip, count: 1, resetAt: windowEnd },
    });
    count = 1;
  } else {
    // Active window — increment
    const updated = await db.rateLimit.update({
      where: { ip },
      data: { count: { increment: 1 } },
    });
    count = updated.count;
  }

  const allowed = count <= MAX_ATTEMPTS;
  const remaining = Math.max(0, MAX_ATTEMPTS - count);

  return NextResponse.json({ allowed, remaining });
}
