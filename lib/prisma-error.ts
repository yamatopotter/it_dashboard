import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export function notFoundOnP2025(err: unknown): NextResponse | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}
