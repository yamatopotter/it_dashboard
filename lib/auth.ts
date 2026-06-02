import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        try {
          const user = await db.user.findUnique({
            where: { username: credentials.username as string },
          });

          if (!user) return null;

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!valid) return null;

          return { id: user.id, name: user.username };
        } catch (error) {
          console.error("[auth] erro:", error);
          return null;
        }
      },
    }),
  ],
});
