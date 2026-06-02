import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth: middleware } = NextAuth({
  ...authConfig,
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});

export const config = {
  matcher: ["/((?!api/auth|api/links/[^/]+/(?:down|up)|_next/static|_next/image|favicon.ico|login).*)"],
};
