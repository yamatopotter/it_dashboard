import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { writeAudit, extractIp } from "@/lib/audit";
import { resolveZohoClientSecret } from "@/lib/crypto";

async function buildProviders() {
  const providers = [
    Credentials({
      credentials: {
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
        totp:     { label: "Código 2FA", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.username || !credentials?.password) return null;

        const ip = request ? extractIp(request) : null;

        try {
          const user = await db.user.findUnique({
            where: { username: credentials.username as string },
          });

          if (!user) {
            await writeAudit({ action: "LOGIN_FAILED", entity: "Auth", entityName: credentials.username as string, userId: null, username: null, ipAddress: ip });
            return null;
          }

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.password || ""
          );

          if (!valid) {
            await writeAudit({ action: "LOGIN_FAILED", entity: "Auth", entityName: credentials.username as string, userId: null, username: null, ipAddress: ip });
            return null;
          }

          // SEC-009: verify TOTP if enabled
          if (user.totpEnabled && user.totpSecret) {
            const totpToken = (credentials.totp as string | undefined) ?? "";
            if (!totpToken) {
              // TOTP required but not provided — fail silently (login page pre-checks)
              return null;
            }
            const { decryptSecret, verifyTotp } = await import("@/lib/totp");
            const secret = decryptSecret(user.totpSecret);
            if (!(await verifyTotp(totpToken, secret))) {
              await writeAudit({ action: "LOGIN_FAILED", entity: "Auth", entityName: user.username, userId: null, username: null, ipAddress: ip });
              return null;
            }
          }

          await writeAudit({ action: "LOGIN", entity: "Auth", entityId: user.id, entityName: user.username, userId: user.id, username: user.username, ipAddress: ip });
          return { id: user.id, name: user.username, role: user.role };
        } catch (error) {
          console.error("[auth] erro:", error);
          return null;
        }
      },
    }),
  ];

  const config = await db.systemConfig.findUnique({ where: { id: 1 } });
  if (config?.zohoEnabled && config.zohoClientId && config.zohoClientSecretEnc) {
    const clientSecret = resolveZohoClientSecret(config);
    const accountsUrl = config.zohoAccountsUrl || "https://accounts.zoho.com";
    if (clientSecret) {
      providers.push({
        id: "zoho",
        name: "Zoho",
        type: "oauth",
        clientId: config.zohoClientId,
        clientSecret,
        authorization: {
          url: `${accountsUrl}/oauth/v2/auth`,
          params: { scope: "AaaServer.profile.Read", access_type: "offline", prompt: "consent" },
        },
        token: `${accountsUrl}/oauth/v2/token`,
        userinfo: `${accountsUrl}/oauth/user/info`,
        profile(profile: { ZUID: string; Email: string; Display_Name: string }) {
          return { id: profile.ZUID, email: profile.Email, name: profile.Display_Name };
        },
      } as any);
    }
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth(async () => ({
  ...authConfig,
  providers: await buildProviders(),
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "zoho") {
        if (!user.email) return false;
        const existing = await db.user.findUnique({ where: { email: user.email } });
        if (!existing || existing.authProvider !== "ZOHO") return false;
        user.id = existing.id;
        (user as { role?: string }).role = existing.role;
        void writeAudit({ action: "LOGIN", entity: "Auth", entityId: existing.id, entityName: existing.username, userId: existing.id, username: existing.username });
        return true;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        // SEC-021: assign a unique jti (JWT ID) on first token creation
        token.jti = crypto.randomUUID();
      }

      // SEC-021: reject blacklisted tokens (e.g., after explicit logout)
      if (token.jti && typeof token.jti === "string") {
        const blacklisted = await db.tokenBlacklist
          .findUnique({ where: { jti: token.jti } })
          .catch(() => null);
        if (blacklisted) return null;
      }

      // SEC-021: invalidate tokens issued before the user's last password change
      if (token.sub && typeof token.iat === "number") {
        const u = await db.user
          .findUnique({ where: { id: token.sub }, select: { passwordChangedAt: true } })
          .catch(() => null);
        if (u?.passwordChangedAt && u.passwordChangedAt.getTime() > token.iat * 1000) {
          return null;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
}));
