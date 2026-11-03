export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionRole } from "@/lib/with-auth";
import { requireModule } from "@/lib/module-config";

export type Computer = Awaited<ReturnType<typeof db.computer.findFirst>>;

export interface ComputerPaginatedResponse {
  data: Computer[];
  total: number;
  page: number;
  limit: number;
}

export async function GET(req: NextRequest) {
  const role = await getSessionRole();
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const off = await requireModule("computers");
  if (off) return off;

  const { searchParams } = new URL(req.url);
  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");
  const onlineFilter = searchParams.get("online"); // "true" | "false"
  const hasAlerts = searchParams.get("hasAlerts"); // "true"
  const search = searchParams.get("search");

  const limit = Math.min(Math.max(parseInt(rawLimit ?? "50", 10) || 50, 1), 200);
  const page = Math.max(parseInt(rawPage ?? "1", 10) || 1, 1);

  const where: any = { deletedInDatto: false };
  if (onlineFilter === "true") where.online = true;
  if (onlineFilter === "false") where.online = false;
  if (hasAlerts === "true") where.openAlertsCount = { gt: 0 };
  if (search) {
    where.OR = [
      { hostname: { contains: search, mode: "insensitive" } },
      { siteName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [computers, total] = await Promise.all([
    db.computer.findMany({
      where,
      orderBy: [{ online: "desc" as const }, { hostname: "asc" as const }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.computer.count({ where }),
  ]);

  return NextResponse.json(
    { data: computers, total, page, limit } as ComputerPaginatedResponse,
    { headers: { "X-Total-Count": String(total) } }
  );
}
