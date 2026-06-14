import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createTestDb(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: "postgresql://it_dashboard:it_dashboard@localhost:5432/it_dashboard_test",
  });
  return new PrismaClient({ adapter });
}
