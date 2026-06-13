import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { LRUCache } from "lru-cache";

const { auth } = NextAuth({
  ...authConfig,
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});

// SEC-026: LRU cache with TTL replaces unbounded Map — auto-evicts expired entries,
// bounded at 10k IPs, survives within a single process lifetime.
// Edge Runtime constraint prevents persistent DB storage here; for multi-instance
// deployments, swap for an Upstash Redis client.
const loginAttempts = new LRUCache<string, number>({
  max:  10_000,
  ttl:  15 * 60_000, // 15-minute sliding window
});

function isRateLimited(ip: string): boolean {
  const count = (loginAttempts.get(ip) ?? 0) + 1;
  loginAttempts.set(ip, count);
  return count > 10;
}

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    "default-src 'self'",
    // SEC-020: nonce + strict-dynamic replaces unsafe-inline in production.
    // strict-dynamic propagates trust to scripts loaded by trusted scripts (Next.js hydration).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp   = buildCsp(nonce);

  let response: NextResponse;

  // Rate limit login attempts before NextAuth processes them
  if (req.method === "POST" && req.nextUrl.pathname === "/api/auth/callback/credentials") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    if (isRateLimited(ip)) {
      response = NextResponse.json(
        { error: "Muitas tentativas de login. Aguarde 15 minutos." },
        { status: 429 }
      );
    } else {
      response = NextResponse.next();
    }
  } else {
    // Session enforcement — cast needed: NextAuth's `auth` expects NextAuthRequest
    const authFn = auth as unknown as (req: NextRequest) => Promise<NextResponse | null>;
    response = (await authFn(req)) ?? NextResponse.next();
  }

  // Inject per-request nonce into CSP and expose it for server components
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Nonce", nonce);
  return response;
}

export const config = {
  matcher: [
    // Include credentials callback for rate limiting
    "/api/auth/callback/credentials",
    // Protect all other routes except public ones
    "/((?!api/auth|api/links/[^/]+/(?:down|up)|_next/static|_next/image|favicon.ico|login).*)",
  ],
};
