import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  ip: z.string().min(1).optional(),
  type: z.enum(["MIKROTIK", "DVR", "CAMERA", "OTHER"]).optional(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  pingEnabled: z.boolean().optional(),
  httpEnabled: z.boolean().optional(),
  httpPort: z.number().optional().nullable(),
  httpPath: z.string().optional(),
  snmpEnabled: z.boolean().optional(),
  snmpCommunity: z.string().optional(),
  snmpPort: z.number().optional(),
  routerosEnabled: z.boolean().optional(),
  routerosUser: z.string().optional().nullable(),
  routerosPass: z.string().optional().nullable(),
  routerosPort: z.number().optional(),
  checkInterval: z.number().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const device = await db.device.findUnique({
    where: { id },
    include: { currentStatus: true },
  });

  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(device);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const device = await db.device.update({ where: { id }, data: parsed.data });

  return NextResponse.json(device);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await db.device.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
