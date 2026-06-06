import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "") || 24, 720);
  const since = new Date(Date.now() - hours * 3600 * 1000);

  const [link, events] = await Promise.all([
    db.link.findUnique({ where: { id } }),
    db.linkEvent.findMany({
      where: { linkId: id, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find the last event before the window to know the initial state
  const lastBefore = await db.linkEvent.findFirst({
    where: { linkId: id, timestamp: { lt: since } },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json({ link, events, lastBefore: lastBefore ?? null, since });
}
