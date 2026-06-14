import { config } from "dotenv";
import { resolve } from "path";

export default async function globalSetup() {
  // Load test environment variables
  config({ path: resolve(process.cwd(), ".env.test") });
  process.env.DATABASE_URL = "postgresql://it_dashboard:it_dashboard@localhost:5432/it_dashboard_test";
}
