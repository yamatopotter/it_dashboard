/**
 * @jest-environment node
 */
import { GET } from "@/app/api/devices/[id]/export/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  db: {
    device: { findUnique: jest.fn() },
    statusHistory: { findMany: jest.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;

const SESSION = { user: { id: "u1", name: "admin", role: "ADMIN" }, expires: "2099-01-01" };
const DEVICE = { id: "dev1", name: "Router HQ" };

const ROWS = [
  { timestamp: new Date("2026-01-01T10:00:00Z"), isOnline: true,  pingMs: 5,   cpuLoad: 20.5, memoryUsed: 60.0 },
  { timestamp: new Date("2026-01-01T10:01:00Z"), isOnline: false, pingMs: null, cpuLoad: null, memoryUsed: null },
];

function makeReq(id: string, search = "") {
  return new NextRequest(`http://localhost/api/devices/${id}/export${search}`);
}

beforeEach(() => {
  mockAuth.mockResolvedValue(SESSION as any);
  (mockDb.device.findUnique as jest.Mock).mockResolvedValue(DEVICE);
  (mockDb.statusHistory.findMany as jest.Mock).mockResolvedValue(ROWS);
});

afterEach(() => jest.clearAllMocks());

describe("GET /api/devices/[id]/export", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as any);
    const res = await GET(makeReq("dev1"), { params: Promise.resolve({ id: "dev1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown device", async () => {
    (mockDb.device.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await GET(makeReq("unknown"), { params: Promise.resolve({ id: "unknown" }) });
    expect(res.status).toBe(404);
  });

  it("returns Content-Type text/csv", async () => {
    const res = await GET(makeReq("dev1"), { params: Promise.resolve({ id: "dev1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
  });

  it("returns Content-Disposition attachment with filename", async () => {
    const res = await GET(makeReq("dev1"), { params: Promise.resolve({ id: "dev1" }) });
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain("Router_HQ");
    expect(cd).toContain(".csv");
  });

  it("returns header row + correct number of data rows", async () => {
    const res = await GET(makeReq("dev1"), { params: Promise.resolve({ id: "dev1" }) });
    const text = await res.text();
    const lines = text.split("\n").filter(Boolean);
    expect(lines[0]).toBe("timestamp,isOnline,pingMs,cpuLoad,memoryUsed");
    expect(lines).toHaveLength(ROWS.length + 1);
  });

  it("encodes null fields as empty string", async () => {
    const res = await GET(makeReq("dev1"), { params: Promise.resolve({ id: "dev1" }) });
    const text = await res.text();
    const dataLines = text.split("\n").filter(Boolean).slice(1);
    expect(dataLines[1]).toMatch(/false,,,$/);
  });

  it("sanitizes fields starting with = to prevent CSV injection", async () => {
    (mockDb.device.findUnique as jest.Mock).mockResolvedValue({ id: "dev2", name: "=DANGER" });
    (mockDb.statusHistory.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(makeReq("dev2"), { params: Promise.resolve({ id: "dev2" }) });
    const cd = res.headers.get("Content-Disposition") ?? "";
    // filename sanitizes special chars to underscore
    expect(cd).not.toContain("=DANGER");
  });

  it("respects ?hours= parameter by passing gte filter to query", async () => {
    await GET(makeReq("dev1", "?hours=24"), { params: Promise.resolve({ id: "dev1" }) });
    const call = (mockDb.statusHistory.findMany as jest.Mock).mock.calls[0][0];
    const since: Date = call.where.timestamp.gte;
    const diffHours = (Date.now() - since.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(24, 0);
  });

  it("clamps hours to maximum 8760", async () => {
    await GET(makeReq("dev1", "?hours=99999"), { params: Promise.resolve({ id: "dev1" }) });
    const call = (mockDb.statusHistory.findMany as jest.Mock).mock.calls[0][0];
    const since: Date = call.where.timestamp.gte;
    const diffHours = (Date.now() - since.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(8760, 0);
  });
});
