export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/auth/check-2fa?username=X
// Returns whether a username has TOTP enabled.
// No auth required — used by the login page to conditionally show the TOTP field.
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ totpEnabled: false });
  }

  const user = await db.user.findUnique({
    where: { username },
    select: { totpEnabled: true },
  });

  return NextResponse.json({ totpEnabled: user?.totpEnabled ?? false });
}
