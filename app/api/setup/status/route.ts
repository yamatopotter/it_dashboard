import { NextResponse } from "next/server";
import { isSetupComplete, readSetupLockAsync } from "@/lib/setup";

export async function GET() {
  const complete = await isSetupComplete();
  const lock = complete ? await readSetupLockAsync() : null;
  return NextResponse.json({ complete, provider: lock?.provider ?? null });
}
