/**
 * @jest-environment node
 */
import { GET, resetTowerCache } from "@/app/api/tower/route";
import { buildTowerSnapshot } from "@/lib/tower-snapshot";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  db: {
    $queryRaw: jest.fn(),
    device: { findMany: jest.fn() },
    link: { findMany: jest.fn() },
    linkEvent: { findMany: jest.fn() },
    workerHeartbeat: { findUnique: jest.fn() },
    statusHistory: { count: jest.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as unknown as {
  $queryRaw: jest.Mock; device: { findMany: jest.Mock }; link: { findMany: jest.Mock };
  linkEvent: { findMany: jest.Mock }; workerHeartbeat: { findUnique: jest.Mock }; statusHistory: { count: jest.Mock };
};
const SESSION = { user: { id: "u1", name: "admin", role: "VIEWER" }, expires: "2099-01-01" };

const status = (isOnline: boolean) => ({ isOnline, pingMs: 5, cpuLoad: null, checkedAt: new Date(), unifiData: null, omadaData: null });
const baseDevice = { ip: "10.0.0.1", alertThreshold: 3, maintenanceUntil: null, offlineAcknowledgedAt: null, offlineAcknowledgedBy: null, offlineAcknowledgedNote: null };

function seed() {
  const now = Date.now();
  mockDb.device.findMany.mockResolvedValue([
    { ...baseDevice, id: "gw", name: "GW Barra", type: "MIKROTIK", site: "BAR", currentStatus: status(true) },
    { ...baseDevice, id: "sw", name: "SW", type: "OTHER", site: "BAR", currentStatus: status(false) },
    { ...baseDevice, id: "ap", name: "AP", type: "UNIFI_AP", site: null, currentStatus: { ...status(true), unifiData: { totalClients: 7, ssids: [{ channel: 36 }] } } },
  ]);
  mockDb.link.findMany.mockResolvedValue([
    { id: "l1", name: "Vivo", description: null, site: "BAR", isOnline: false, lastEventAt: new Date(now - 60_000),
      mikrotikDevice: { name: "GW Barra" }, mikrotikInterface: "ether1", contractedDownloadBps: 100e6, contractedUploadBps: 100e6,
      downloadBps: null, uploadBps: null, latencyMs: null, maintenanceUntil: null,
      offlineAcknowledgedAt: null, offlineAcknowledgedBy: null, offlineAcknowledgedNote: null },
  ]);
  mockDb.linkEvent.findMany.mockResolvedValue([{ id: "e1", linkId: "l1", type: "DOWN", timestamp: new Date(now - 60_000) }]);
  mockDb.workerHeartbeat.findUnique.mockResolvedValue({ seenAt: new Date() });
  mockDb.statusHistory.count.mockResolvedValueOnce(10).mockResolvedValueOnce(9);
  mockDb.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("COUNT(*)")) return [{ deviceId: "sw", fails: 4, since: new Date(now - 300_000) }];
    if (sql.includes("date_bin")) return [{ id: "sw", bucket: new Date(), v: 12 }];
    return [];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetTowerCache();
});

describe("GET /api/tower", () => {
  it("401 sem sessão", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://localhost/api/tower"));
    expect(res.status).toBe(401);
  });

  it("devolve o snapshot com no-store e ETag", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    seed();
    const res = await GET(new Request("http://localhost/api/tower"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("ETag")).toBeTruthy();
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["aps", "devices", "events", "health", "links", "monitored", "problems", "sites"]);
    expect(body.problems).toHaveLength(1);
    expect(body.problems[0]).toMatchObject({ id: "LINK:l1", severity: "crit", what: "DOWN" });
    expect(body.problems[0].children).toEqual([{ id: "sw", name: "SW", kind: "DISP" }]);
    expect(body.devices.find((d: { id: string }) => d.id === "sw")).toMatchObject({ state: "sup", suppressedByLinkId: "l1", spark: [12] });
    expect(body.aps[0]).toMatchObject({ clients: 7, channel: "36", vendor: "unifi" });
    expect(body.sites.map((s: { name: string }) => s.name)).toEqual(["Barra", "Botafogo", "Itaguaí", "?"]);
    expect(body.monitored).toEqual({ total: 4, online: 2 });
    expect(body.health.workerStatus).toBe("ok");
  });

  it("304 quando If-None-Match bate; segunda chamada usa cache", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    seed();
    const first = await GET(new Request("http://localhost/api/tower"));
    const etag = first.headers.get("ETag")!;
    const second = await GET(new Request("http://localhost/api/tower", { headers: { "If-None-Match": etag } }));
    expect(second.status).toBe(304);
    expect(mockDb.device.findMany).toHaveBeenCalledTimes(1);
  });

  it("ignora NVR e câmeras na consulta", async () => {
    mockAuth.mockResolvedValue(SESSION as never);
    seed();
    await GET(new Request("http://localhost/api/tower"));
    expect(mockDb.device.findMany.mock.calls[0][0].where.type.notIn).toEqual(["DVR", "CAMERA"]);
  });
});

describe("buildTowerSnapshot", () => {
  it("sem dados devolve estrutura vazia válida", async () => {
    mockDb.device.findMany.mockResolvedValue([]);
    mockDb.link.findMany.mockResolvedValue([]);
    mockDb.linkEvent.findMany.mockResolvedValue([]);
    mockDb.$queryRaw.mockResolvedValue([]);
    mockDb.workerHeartbeat.findUnique.mockResolvedValue(null);
    mockDb.statusHistory.count.mockResolvedValue(0);
    const s = await buildTowerSnapshot();
    expect(s.problems).toEqual([]);
    expect(s.health).toMatchObject({ workerStatus: "unknown", uptimePct24h: null });
    expect(s.sites).toHaveLength(3);
  });
});
