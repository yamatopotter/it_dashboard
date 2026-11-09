export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/with-auth";

export async function GET() {
  const unauth = await requireRole("ADMIN");
  if (unauth) return unauth;

  const rows = await db.computer.findMany({
    where: { deletedInDatto: false, siteName: { not: null } },
    select: { siteName: true },
    distinct: ["siteName"],
    orderBy: { siteName: "asc" },
  });

  const sites = rows.map((r) => r.siteName).filter((s): s is string => !!s);
  return NextResponse.json({ sites });
}
