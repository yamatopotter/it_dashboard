import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import { withAuth } from "@/lib/with-auth";
import { parseAndValidate } from "@/lib/parse-body";
import { notFoundOnP2025 } from "@/lib/prisma-error";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  mikrotikDeviceId: z.string().optional().nullable(),
  mikrotikInterface: z.string().max(50).optional().nullable(),
  contractedDownloadBps: z.number().int().positive().optional().nullable(),
  contractedUploadBps: z.number().int().positive().optional().nullable(),
});

export const GET = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const link = await db.link.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(link);
});

export const PUT = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await parseAndValidate(req, updateSchema);
  if (!body.ok) return body.response;

  try {
    const link = await db.link.update({ where: { id }, data: body.data });
    return NextResponse.json(link);
  } catch (err) {
    return notFoundOnP2025(err) ?? (() => { throw err; })();
  }
});

export const DELETE = withAuth(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  try {
    await db.link.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return notFoundOnP2025(err) ?? (() => { throw err; })();
  }
});
