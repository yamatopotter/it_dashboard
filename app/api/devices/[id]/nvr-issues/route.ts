export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import type { NvrChannelIssue } from "@prisma/client";
import { requireModule } from "@/lib/module-config";

export interface PaginatedNvrIssuesResponse {
  data: NvrChannelIssue[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireAuth();
  if (unauth) return unauth;
  const off = await requireModule("nvr");
  if (off) return off;
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "") || 25));

  const [data, total] = await Promise.all([
    db.nvrChannelIssue.findMany({
      where: { deviceId: id },
      orderBy: { detectedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.nvrChannelIssue.count({ where: { deviceId: id } }),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  } satisfies PaginatedNvrIssuesResponse);
}
