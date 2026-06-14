/**
 * Load test: 50 devices with 1-second check interval.
 * All monitors mocked to return instantly — tests scheduler throughput and DB writes only.
 * Run with: npm run test:integration
 */

process.env.DATABASE_URL = "postgresql://it_dashboard:it_dashboard@localhost:5432/it_dashboard_test";
process.env.ENCRYPTION_KEY = "0".repeat(64);
process.env.WEBHOOK_SECRET = "test-webhook-secret-for-integration-tests-32chars";
process.env.NEXTAUTH_SECRET = "test-secret-for-integration-tests-minimum-32-chars";

jest.mock("@/worker/monitors/ping",         () => ({ checkPing:        jest.fn().mockResolvedValue({ alive: true, responseMs: 1 }) }));
jest.mock("@/worker/monitors/http",         () => ({ checkHttp:        jest.fn().mockResolvedValue({ ok: true, statusCode: 200, responseMs: 1 }) }));
jest.mock("@/worker/monitors/snmp",         () => ({ checkSnmp:        jest.fn().mockResolvedValue(null) }));
jest.mock("@/worker/monitors/routeros",     () => ({ checkRouterOS:    jest.fn().mockResolvedValue(null) }));
jest.mock("@/worker/monitors/unifi",        () => ({ checkUnifi:       jest.fn().mockResolvedValue(null) }));
jest.mock("@/worker/monitors/omada",        () => ({ checkOmada:       jest.fn().mockResolvedValue(null) }));
jest.mock("@/worker/monitors/link-traffic", () => ({ checkLinkTraffic: jest.fn().mockResolvedValue({ downloadBps: 0, uploadBps: 0 }) }));
jest.mock("@/lib/crypto", () => ({
  resolveRouterosCredentials: jest.fn().mockReturnValue(null),
  resolveSnmpCommunity:       jest.fn().mockReturnValue("public"),
  resolveUnifiApiKey:         jest.fn().mockReturnValue(null),
  resolveUnifiCredentials:    jest.fn().mockReturnValue(null),
  resolveOmadaCredentials:    jest.fn().mockReturnValue(null),
  validateKey:                jest.fn(),
}));

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createTestDb() {
  const adapter = new PrismaPg({
    connectionString: "postgresql://it_dashboard:it_dashboard@localhost:5432/it_dashboard_test",
  });
  return new PrismaClient({ adapter });
}

const DEVICE_COUNT = 50;
const TEST_PREFIX  = `load-test-${Date.now()}`;
const deviceIds: string[] = [];

beforeAll(async () => {
  const db = createTestDb();
  try {
    for (let i = 0; i < DEVICE_COUNT; i++) {
      const device = await db.device.create({
        data: {
          name: `${TEST_PREFIX}-device-${i.toString().padStart(2, "0")}`,
          ip: `10.99.${Math.floor(i / 254)}.${(i % 254) + 1}`,
          type: "OTHER",
          pingEnabled: true,
          checkInterval: 1,
          alertThreshold: 3,
        },
      });
      deviceIds.push(device.id);
    }
  } finally {
    await db.$disconnect();
  }
}, 60_000);

afterAll(async () => {
  const { shutdown } = await import("@/worker/scheduler");
  await shutdown(5_000);

  const db = createTestDb();
  try {
    await db.statusHistory.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await db.deviceStatus.deleteMany({ where: { deviceId: { in: deviceIds } } });
    await db.device.deleteMany({ where: { id: { in: deviceIds } } });
  } finally {
    await db.$disconnect();
  }
}, 30_000);

describe("Worker load test — 50 devices @ 1s interval", () => {
  it("starts scheduler and all 50 devices receive DeviceStatus within 5 seconds", async () => {
    const { startScheduler } = await import("@/worker/scheduler");
    await startScheduler();

    await new Promise((r) => setTimeout(r, 3_000));

    const db = createTestDb();
    try {
      const statuses = await db.deviceStatus.findMany({
        where: { deviceId: { in: deviceIds } },
      });
      expect(statuses.length).toBe(DEVICE_COUNT);
      statuses.forEach((s) => {
        expect(s.isOnline).toBe(true);
        expect(s.checkedAt).toBeTruthy();
      });
    } finally {
      await db.$disconnect();
    }
  }, 15_000);

  it("StatusHistory has entries for all 50 devices", async () => {
    const db = createTestDb();
    try {
      const devicesWith = await db.statusHistory.findMany({
        where: { deviceId: { in: deviceIds } },
        distinct: ["deviceId"],
        select: { deviceId: true },
      });
      expect(devicesWith.length).toBe(DEVICE_COUNT);
    } finally {
      await db.$disconnect();
    }
  });

  it("shutdown drains all pending checks without hanging", async () => {
    const { shutdown } = await import("@/worker/scheduler");
    const start = Date.now();
    await shutdown(5_000);
    expect(Date.now() - start).toBeLessThan(6_000);
  }, 10_000);
});
