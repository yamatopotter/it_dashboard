import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const noteSchema = z.object({
  title: z.string().min(1, "Título obrigatório").max(200),
  content: z.string().min(1, "Conteúdo obrigatório"),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).default("INFO"),
  category: z.enum(["SECURITY", "OPERATIONAL", "GENERAL"]).default("GENERAL"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).default("OPEN"),
  deviceId: z.string().optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notes = await db.note.findMany({
    include: { device: { select: { id: true, name: true, ip: true } } },
    orderBy: [
      { severity: "desc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = noteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const note = await db.note.create({
    data: parsed.data,
    include: { device: { select: { id: true, name: true, ip: true } } },
  });

  return NextResponse.json(note, { status: 201 });
}
