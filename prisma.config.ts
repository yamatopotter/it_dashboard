import { defineConfig } from "prisma/config";
import path from "node:path";

const dbUrl = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "prisma/dev.db")}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: dbUrl,
  },
});
