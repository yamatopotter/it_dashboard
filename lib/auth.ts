import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { writeAudit, extractIp } from "@/lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
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
            user.password
          );

          if (!valid) {
            await writeAudit({ action: "LOGIN_FAILED", entity: "Auth", entityName: credentials.username as string, userId: null, username: null, ipAddress: ip });
            return null;
          }

          await writeAudit({ action: "LOGIN", entity: "Auth", entityId: user.id, entityName: user.username, userId: user.id, username: user.username, ipAddress: ip });
          return { id: user.id, name: user.username, role: user.role };
        } catch (error) {
          console.error("[auth] erro:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as { role: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
