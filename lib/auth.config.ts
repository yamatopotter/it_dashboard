import type { NextAuthConfig } from "next-auth";
import { isSetupComplete } from "@/lib/setup";

const secret = process.env.NEXTAUTH_SECRET;

// During the setup wizard (no setup.lock yet), NEXTAUTH_SECRET may not exist.
// Auth is not used on /setup routes, so a placeholder keeps the module loadable.
// Once setup completes the app restarts with a real generated secret.
if (!secret && isSetupComplete()) {
  throw new Error(
    "NEXTAUTH_SECRET não está definido. Defina a variável de ambiente antes de iniciar a aplicação."
  );
}

export const authConfig = {
  pages: { signIn: "/login" },
  // SEC-028: sessão de 8h — razoável para dashboard de uso diurno
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  secret: secret ?? "setup-mode-placeholder-not-used-for-auth",
  trustHost: true,
  providers: [],
} satisfies NextAuthConfig;
