import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, getSessionRole } from "@/lib/with-auth";
import { generateWebhookToken } from "@/lib/webhook";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "") || 24, 720);
  const since = new Date(Date.now() - hours * 3600 * 1000);

  const [link, recentEvents] = await Promise.all([
    db.link.findUnique({ where: { id } }),
    // Bound memory: fetch the most recent 2000 events in the window, then present
    // them ascending. A link toggling more than this in one window is pathological.
    db.linkEvent.findMany({
      where: { linkId: id, timestamp: { gte: since } },
      orderBy: { timestamp: "desc" },
      take: 2000,
    }),
  ]);
  const events = recentEvents.reverse();

  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find the last event before the window to know the initial state
  const lastBefore = await db.linkEvent.findFirst({
    where: { linkId: id, timestamp: { lt: since } },
    orderBy: { timestamp: "desc" },
  });

  const role = await getSessionRole();
  const canSeeToken = role === "ADMIN" || role === "OPERADOR";
  const linkWithToken = canSeeToken ? { ...link, webhookToken: generateWebhookToken(id) } : link;

  return NextResponse.json({ link: linkWithToken, events, lastBefore: lastBefore ?? null, since });
}
