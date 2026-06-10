import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";

export const GET = withAuth(async (
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) => {
  const { deviceId } = await params;
  const { searchParams } = new URL(req.url);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "") || 24, 168);

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const history = await db.statusHistory.findMany({
    where: { deviceId, timestamp: { gte: since } },
    orderBy: { timestamp: "asc" },
    take: 500,
  });

  return NextResponse.json(history);
});
