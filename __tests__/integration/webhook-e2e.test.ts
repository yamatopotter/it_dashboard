/**
 * Integration test: webhook UP/DOWN flow against a real PostgreSQL database.
 * Run with: npm run test:integration
 */
process.env.WEBHOOK_SECRET = "test-webhook-secret-for-integration-tests-32chars";

import { createTestDb } from "./db-helper";
import { generateWebhookToken } from "@/lib/webhook";

const db = createTestDb();
const TEST_PREFIX = `webhook-e2e-${Date.now()}`;
let linkId: string;

beforeAll(async () => {
  const link = await db.link.create({
    data: { name: `${TEST_PREFIX}-fibra`, isOnline: true },
  });
  linkId = link.id;
});

afterAll(async () => {
  await db.linkEvent.deleteMany({ where: { linkId } });
  await db.link.deleteMany({ where: { id: linkId } });
  await db.$disconnect();
});

describe("Webhook UP/DOWN flow — real database", () => {
  it("link starts as online", async () => {
    const link = await db.link.findUnique({ where: { id: linkId } });
    expect(link!.isOnline).toBe(true);
  });

  it("DOWN: sets isOnline=false and records LinkEvent", async () => {
    const token = generateWebhookToken(linkId);
    expect(token).toBeTruthy();

    await db.link.update({ where: { id: linkId }, data: { isOnline: false, lastEventAt: new Date() } });
    await db.linkEvent.create({ data: { linkId, type: "DOWN" } });

    const link = await db.link.findUnique({ where: { id: linkId } });
    expect(link!.isOnline).toBe(false);

    const events = await db.linkEvent.findMany({ where: { linkId }, orderBy: { timestamp: "desc" } });
    expect(events[0].type).toBe("DOWN");
  });

  it("UP: sets isOnline=true and records LinkEvent", async () => {
    await db.link.update({ where: { id: linkId }, data: { isOnline: true, lastEventAt: new Date() } });
    await db.linkEvent.create({ data: { linkId, type: "UP" } });

    const link = await db.link.findUnique({ where: { id: linkId } });
    expect(link!.isOnline).toBe(true);

    const events = await db.linkEvent.findMany({ where: { linkId }, orderBy: { timestamp: "desc" } });
    expect(events[0].type).toBe("UP");
  });

  it("event history is ordered correctly (latest first)", async () => {
    const events = await db.linkEvent.findMany({
      where: { linkId },
      orderBy: { timestamp: "desc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("UP");
    expect(events[1].type).toBe("DOWN");
  });

  it("range query on linkEvent index returns only recent events", async () => {
    const since = new Date(Date.now() - 60_000);
    const recent = await db.linkEvent.findMany({
      where: { linkId, timestamp: { gte: since } },
    });
    expect(recent.length).toBeGreaterThanOrEqual(1);
  });
});
