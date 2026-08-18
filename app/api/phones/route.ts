export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, getSessionRole } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { writeAudit } from "@/lib/audit";
import { phoneCreateSchema } from "@/lib/schemas/phone";

export type Phone = Awaited<ReturnType<typeof db.phone.findFirst>>;

export interface PhonePaginatedResponse {
  data: Phone[];
  total: number;
  page: number;
  limit: number;
}

export async function GET(req: NextRequest) {
  const role = await getSessionRole();
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");
  const statusFilter = searchParams.get("status");
  const expiringIn = searchParams.get("expiringIn"); // days

  const limit = Math.min(Math.max(parseInt(rawLimit ?? "50", 10) || 50, 1), 200);
  const page = Math.max(parseInt(rawPage ?? "1", 10) || 1, 1);

  const where: any = {};
  if (statusFilter && ["ACTIVE", "SUSPENDED", "CANCELED"].includes(statusFilter)) {
    where.status = statusFilter;
  }

  if (expiringIn) {
    const days = parseInt(expiringIn, 10);
    if (!isNaN(days) && days > 0) {
      const now = new Date();
      const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      where.loyaltyEndDate = { lte: future, gte: now };
    }
  }

  const paginate = rawPage !== null || rawLimit !== null;

  if (paginate) {
    const [phones, total] = await Promise.all([
      db.phone.findMany({
        where,
        orderBy: { createdAt: "desc" as const },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.phone.count({ where }),
    ]);
    return NextResponse.json(
      { data: phones, total, page, limit } as PhonePaginatedResponse,
      { headers: { "X-Total-Count": String(total) } }
    );
  }

  const phones = await db.phone.findMany({
    where,
    orderBy: { createdAt: "desc" as const },
  });
  return NextResponse.json(phones);
}

export async function POST(req: Request) {
  const unauth = await requireRole("OPERADOR");
  if (unauth) return unauth;

  const body = await parseAndValidate(req, phoneCreateSchema);
  if (!body.ok) return body.response;

  const phone = await db.phone.create({ data: body.data });
  void writeAudit({
    action: "CREATE",
    entity: "Phone",
    entityId: phone.id,
    entityName: phone.phoneNumber,
    details: { owner: phone.owner },
  });
  return NextResponse.json(phone, { status: 201 });
}
