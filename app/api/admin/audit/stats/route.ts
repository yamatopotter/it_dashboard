export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/with-auth";
import { db } from "@/lib/db";

export async function GET() {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);

  const [by24h, by7d, recentLogins, topUsers] = await Promise.all([
    db.auditLog.groupBy({
      by: ["action"],
      where: { timestamp: { gte: h24 } },
      _count: { id: true },
    }),
    db.auditLog.groupBy({
      by: ["action"],
      where: { timestamp: { gte: d7 } },
      _count: { id: true },
    }),
    db.auditLog.findMany({
      where: { action: { in: ["LOGIN", "LOGIN_FAILED"] }, timestamp: { gte: d7 } },
      orderBy: { timestamp: "desc" },
      take: 5,
      select: { timestamp: true, action: true, entityName: true, ipAddress: true },
    }),
    db.auditLog.groupBy({
      by: ["username"],
      where: { timestamp: { gte: d7 }, username: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    last24h: by24h.reduce<Record<string, number>>((acc, r) => { acc[r.action] = r._count.id; return acc; }, {}),
    last7d:  by7d.reduce<Record<string, number>>((acc, r)  => { acc[r.action] = r._count.id; return acc; }, {}),
    total24h: by24h.reduce((sum, r) => sum + r._count.id, 0),
    total7d:  by7d.reduce((sum, r) => sum + r._count.id, 0),
    recentLogins,
    topUsers: topUsers.map((u) => ({ username: u.username, actions: u._count.id })),
  });
}
