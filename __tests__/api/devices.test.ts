/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/devices/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  db: {
    device: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    deviceStatus: {
      aggregate: jest.fn(),
    },
    systemConfig: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockWriteAudit = writeAudit as jest.Mock;

const FAKE_SESSION = { user: { id: "user-1", name: "admin", role: "ADMIN" }, expires: "2099-01-01" };

const FAKE_DEVICE = {
  id: "device-1",
  name: "Router Principal",
  ip: "192.168.1.1",
  type: "MIKROTIK" as const,
  location: "Sala de Servidores",
  notes: null,
  pingEnabled: true,
  httpEnabled: false,
  httpPort: null,
  httpPath: "/",
  snmpEnabled: false,
  snmpCommunity: "public",
  snmpPort: 161,
  routerosEnabled: false,
  routerosUserEnc: null,
  routerosPassEnc: null,
  routerosPort: 8728,
  unifiEnabled: false,
  unifiAuthMethod: "apikey",
  unifiApiKeyEnc: null,
  unifiUserEnc: null,
  unifiPassEnc: null,
  unifiPort: 443,
  unifiSite: "default",
  unifiTlsVerify: false,
  unifiControllerIp: null,
  checkInterval: 60,
  createdAt: new Date(),
  updatedAt: new Date(),
  currentStatus: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (mockDb.device.aggregate as jest.Mock).mockResolvedValue({ _count: 1, _max: { updatedAt: new Date("2024-01-01") } });
  (mockDb.deviceStatus.aggregate as jest.Mock).mockResolvedValue({ _count: 1, _max: { checkedAt: new Date("2024-01-01") } });
  (mockDb.systemConfig.findUnique as jest.Mock).mockResolvedValue({ moduleNvr: true });
});

describe("GET /api/devices", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    const res = await GET(new NextRequest("http://localhost/api/devices"));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns devices list when authenticated", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([FAKE_DEVICE]);

    const res = await GET(new NextRequest("http://localhost/api/devices"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Router Principal");
  });

  it("SEC-031: strips snmpCommunity and exposes hasSnmpCredentials", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([
      { ...FAKE_DEVICE, snmpCommunity: "s3cr3t-community", snmpCommunityEnc: null },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/devices"));
    const data = await res.json();
    expect(data[0]).not.toHaveProperty("snmpCommunity");
    expect(data[0]).not.toHaveProperty("snmpCommunityEnc");
    expect(data[0].hasSnmpCredentials).toBe(true);
  });

  it("includes currentStatus in result", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([
      { ...FAKE_DEVICE, currentStatus: { isOnline: true, pingMs: 5 } },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/devices"));
    const data = await res.json();
    expect(data[0].currentStatus.isOnline).toBe(true);
  });

  it("ETag changes when device status changes (regression: stale 304 froze the dashboard)", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([FAKE_DEVICE]);

    // First snapshot: a status check at T1
    (mockDb.deviceStatus.aggregate as jest.Mock).mockResolvedValueOnce({ _count: 1, _max: { checkedAt: new Date("2024-01-01T00:00:00Z") } });
    const etag1 = (await GET(new NextRequest("http://localhost/api/devices"))).headers.get("ETag");

    // Worker writes new statuses (later checkedAt) — Device.updatedAt unchanged
    (mockDb.deviceStatus.aggregate as jest.Mock).mockResolvedValueOnce({ _count: 1, _max: { checkedAt: new Date("2024-01-01T00:05:00Z") } });
    const etag2 = (await GET(new NextRequest("http://localhost/api/devices"))).headers.get("ETag");

    expect(etag1).toBeTruthy();
    expect(etag2).toBeTruthy();
    expect(etag1).not.toBe(etag2);
  });
});

describe("GET /api/devices — módulo NVR", () => {
  it("módulo desligado: exclui DVR/CAMERA da lista", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.systemConfig.findUnique as jest.Mock).mockResolvedValue({ moduleNvr: false });
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([FAKE_DEVICE]);

    const res = await GET(new NextRequest("http://localhost/api/devices"));
    expect(res.status).toBe(200);
    expect(mockDb.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: { notIn: ["DVR", "CAMERA"] } } })
    );
  });

  it("módulo desligado: ?type=DVR explícito continua funcionando", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.systemConfig.findUnique as jest.Mock).mockResolvedValue({ moduleNvr: false });
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest("http://localhost/api/devices?type=DVR"));
    expect(res.status).toBe(200);
    expect(mockDb.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: "DVR" } })
    );
  });

  it("módulo ligado: não filtra por tipo", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([FAKE_DEVICE]);

    await GET(new NextRequest("http://localhost/api/devices"));
    expect(mockDb.device.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it("ETag muda quando o estado do módulo muda", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([FAKE_DEVICE]);
    const on = await GET(new NextRequest("http://localhost/api/devices"));
    (mockDb.systemConfig.findUnique as jest.Mock).mockResolvedValue({ moduleNvr: false });
    const off = await GET(new NextRequest("http://localhost/api/devices"));
    expect(on.headers.get("ETag")).not.toBe(off.headers.get("ETag"));
  });
});

describe("POST /api/devices", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    const req = new NextRequest("http://localhost/api/devices", {
      method: "POST",
      body: JSON.stringify({ name: "Router", ip: "10.0.0.1", type: "MIKROTIK" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates device and returns 201 with valid payload", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.create as jest.Mock).mockResolvedValue(FAKE_DEVICE);

    const req = new NextRequest("http://localhost/api/devices", {
      method: "POST",
      body: JSON.stringify({ name: "Router Principal", ip: "192.168.1.1", type: "MIKROTIK" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Router Principal");
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entity: "Device", entityId: "device-1" })
    );
  });

  it("aceita e persiste site; vazio vira null; valor inválido dá 400", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);
    (mockDb.device.create as jest.Mock).mockResolvedValue({ ...FAKE_DEVICE, site: "BOT" });
    const mk = (site: unknown) => new NextRequest("http://localhost/api/devices", {
      method: "POST",
      body: JSON.stringify({ name: "R", ip: "192.168.1.1", type: "MIKROTIK", site }),
    });
    expect((await POST(mk("BOT"))).status).toBe(201);
    expect((mockDb.device.create as jest.Mock).mock.calls[0][0].data.site).toBe("BOT");
    expect((await POST(mk(""))).status).toBe(201);
    expect((mockDb.device.create as jest.Mock).mock.calls[1][0].data.site).toBeNull();
    expect((await POST(mk("XXX"))).status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);

    const req = new NextRequest("http://localhost/api/devices", {
      method: "POST",
      body: JSON.stringify({ ip: "192.168.1.1" }), // missing name and type
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 for invalid device type", async () => {
    mockAuth.mockResolvedValue(FAKE_SESSION as never);

    const req = new NextRequest("http://localhost/api/devices", {
      method: "POST",
      body: JSON.stringify({ name: "Test", ip: "10.0.0.1", type: "INVALID_TYPE" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
