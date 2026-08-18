import { NextResponse } from "next/server";
import { isSetupCompleteNode, readSetupLock } from "@/lib/setup-node";

export async function GET() {
  const complete = isSetupCompleteNode();
  const lock = complete ? readSetupLock() : null;
  return NextResponse.json({ complete, provider: lock?.provider ?? null });
}
