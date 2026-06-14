export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { writeAudit, extractIp } from "@/lib/audit";

// POST /api/auth/logout — blacklists the current JWT jti before clearing session
export async function POST(req: NextRequest) {
  const session = await auth();
  const ip = extractIp(req);

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (token?.jti && typeof token.jti === "string") {
    const expiresAt = token.exp
      ? new Date((token.exp as number) * 1000)
      : new Date(Date.now() + 8 * 3_600_000);

    await db.tokenBlacklist
      .create({ data: { jti: token.jti, expiresAt } })
      .catch(() => {
        // Already blacklisted — idempotent
      });
  }

  void writeAudit({
    action: "LOGIN",
    entity: "Auth",
    entityName: "logout",
    entityId: session?.user?.id ?? null,
    userId: session?.user?.id ?? null,
    username: session?.user?.name ?? null,
    ipAddress: ip,
  });

  // Clear the NextAuth session cookie(s)
  const res = NextResponse.json({ ok: true });
  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
  ];
  for (const name of cookieNames) {
    res.cookies.set(name, "", { maxAge: 0, path: "/" });
  }
  return res;
}
