import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const SLOW_QUERY_MS = 500;
const IS_DEV = process.env.NODE_ENV !== "production";

function createPgClient(url: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter, log: [{ level: "query", emit: "event" }] });
  if (IS_DEV) {
    client.$on("query", (e) => {
      if (e.duration >= SLOW_QUERY_MS) {
        console.warn(`[Prisma slow query] ${e.duration}ms — ${e.query.slice(0, 200)}`);
      }
    });
  }
  return client;
}

function createBuiltinClient(): PrismaClient {
  // SQLite and MySQL use Prisma's built-in connectors — no driver adapter needed
  const client = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
  if (IS_DEV) {
    client.$on("query", (e) => {
      if (e.duration >= SLOW_QUERY_MS) {
        console.warn(`[Prisma slow query] ${e.duration}ms — ${e.query.slice(0, 200)}`);
      }
    });
  }
  return client;
}

function createClient(): PrismaClient {
  const provider = process.env.DATABASE_PROVIDER ?? "postgresql";
  const url = process.env.DATABASE_URL;
  return provider === "postgresql" && url
    ? createPgClient(url)
    : createBuiltinClient();
}

export const db: PrismaClient = globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient());

if (IS_DEV) globalForPrisma.prisma = db;
