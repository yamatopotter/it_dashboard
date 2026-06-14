import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth({
  ...authConfig,
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});

async function isRateLimited(req: NextRequest, ip: string): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false; // fail open if misconfigured
  try {
    const origin = req.nextUrl.origin;
    const res = await fetch(`${origin}/api/auth/rate-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({ ip }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { allowed?: boolean };
    return data.allowed === false;
  } catch {
    return false; // fail open on network error
  }
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
    if (await isRateLimited(req, ip)) {
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
