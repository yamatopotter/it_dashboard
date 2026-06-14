/**
 * Integration tests: Device CRUD against a real PostgreSQL database.
 * Run with: npm run test:integration
 */
import { createTestDb } from "./db-helper";

const db = createTestDb();
const TEST_PREFIX = `integ-${Date.now()}`;

afterAll(async () => {
  await db.statusHistory.deleteMany({ where: { device: { name: { startsWith: TEST_PREFIX } } } });
  await db.deviceStatus.deleteMany({ where: { device: { name: { startsWith: TEST_PREFIX } } } });
  await db.device.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await db.$disconnect();
});

describe("Device CRUD — real database", () => {
  let deviceId: string;

  it("creates a device", async () => {
    const device = await db.device.create({
      data: {
        name: `${TEST_PREFIX}-router`,
        ip: "192.168.99.1",
        type: "MIKROTIK",
        pingEnabled: true,
        checkInterval: 60,
        alertThreshold: 3,
      },
    });
    deviceId = device.id;
    expect(device.id).toBeTruthy();
    expect(device.name).toBe(`${TEST_PREFIX}-router`);
    expect(device.maintenanceUntil).toBeNull();
  });

  it("reads the created device", async () => {
    const device = await db.device.findUnique({ where: { id: deviceId } });
    expect(device).not.toBeNull();
    expect(device!.ip).toBe("192.168.99.1");
  });

  it("updates maintenanceUntil", async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    const updated = await db.device.update({
      where: { id: deviceId },
      data: { maintenanceUntil: futureDate },
    });
    expect(updated.maintenanceUntil).not.toBeNull();
    expect(updated.maintenanceUntil!.getTime()).toBeCloseTo(futureDate.getTime(), -3);
  });

  it("clears maintenanceUntil", async () => {
    const updated = await db.device.update({
      where: { id: deviceId },
      data: { maintenanceUntil: null },
    });
    expect(updated.maintenanceUntil).toBeNull();
  });

  it("upserts DeviceStatus", async () => {
    const now = new Date();
    await db.deviceStatus.upsert({
      where: { deviceId },
      update: { isOnline: true, pingMs: 5, checkedAt: now },
      create: { deviceId, isOnline: true, pingMs: 5, checkedAt: now },
    });
    const status = await db.deviceStatus.findUnique({ where: { deviceId } });
    expect(status!.isOnline).toBe(true);
    expect(status!.pingMs).toBe(5);
  });

  it("inserts StatusHistory entries", async () => {
    await db.statusHistory.createMany({
      data: [
        { deviceId, isOnline: true,  pingMs: 5,   timestamp: new Date(Date.now() - 120_000) },
        { deviceId, isOnline: false, pingMs: null, timestamp: new Date(Date.now() - 60_000) },
        { deviceId, isOnline: true,  pingMs: 8,   timestamp: new Date() },
      ],
    });
    const count = await db.statusHistory.count({ where: { deviceId } });
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("queries StatusHistory by time window", async () => {
    const since = new Date(Date.now() - 90_000);
    const rows = await db.statusHistory.findMany({
      where: { deviceId, timestamp: { gte: since } },
      orderBy: { timestamp: "asc" },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    rows.forEach((r) => expect(r.timestamp.getTime()).toBeGreaterThanOrEqual(since.getTime()));
  });

  it("deletes device and cascades to StatusHistory and DeviceStatus", async () => {
    await db.device.delete({ where: { id: deviceId } });
    const status  = await db.deviceStatus.findUnique({ where: { deviceId } });
    const history = await db.statusHistory.count({ where: { deviceId } });
    expect(status).toBeNull();
    expect(history).toBe(0);
  });
});
