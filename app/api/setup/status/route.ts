import { NextResponse } from "next/server";
import { isSetupComplete, readSetupLock } from "@/lib/setup";

export async function GET() {
  const complete = isSetupComplete();
  const lock = complete ? readSetupLock() : null;
  return NextResponse.json({ complete, provider: lock?.provider ?? null });
}
