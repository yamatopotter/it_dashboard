import "dotenv/config";
import { defineConfig } from "prisma/config";

const dbUrl      = process.env.DATABASE_URL;
const dbProvider = process.env.DATABASE_PROVIDER ?? "postgresql";

if (!dbUrl) {
  console.warn("[prisma.config] DATABASE_URL não definida — modo setup.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // PostgreSQL uses the tracked migration history; SQLite/MySQL use db push
    path: dbProvider === "postgresql" ? "prisma/migrations" : undefined,
  },
  datasource: dbUrl ? { url: dbUrl } : undefined,
});
