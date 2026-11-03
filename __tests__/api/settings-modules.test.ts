/**
 * @jest-environment node
 */
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  db: { systemConfig: { findUnique: jest.fn(), upsert: jest.fn() } },
}));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn(), extractIp: jest.fn().mockReturnValue(null) }));

import { GET, PUT } from "@/app/api/settings/modules/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const mockAuth = auth as jest.Mock;
const sc = (db as unknown as { systemConfig: { findUnique: jest.Mock; upsert: jest.Mock } }).systemConfig;
const session = (role: string) => ({ user: { id: "u1", name: "x", role }, expires: "2099-01-01" });
const put = (body: unknown) =>
  new Request("http://localhost/api/settings/modules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => jest.clearAllMocks());

describe("GET /api/settings/modules", () => {
  it("401 sem sessão", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("devolve flags para qualquer sessão", async () => {
    mockAuth.mockResolvedValue(session("VIEWER"));
    sc.findUnique.mockResolvedValue({ moduleNvr: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ telephony: false, computers: false, nvr: true });
  });
});

describe("PUT /api/settings/modules", () => {
  it("403 para não-admin", async () => {
    mockAuth.mockResolvedValue(session("OPERADOR"));
    expect((await PUT(put({ nvr: true }))).status).toBe(403);
  });

  it("400 com corpo inválido", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    expect((await PUT(put({ nvr: "sim" }))).status).toBe(400);
  });

  it("salva e audita", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    sc.upsert.mockResolvedValue({ moduleTelephony: true, moduleComputers: false, moduleNvr: false });
    const res = await PUT(put({ telephony: true }));
    expect(res.status).toBe(200);
    expect(sc.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { id: 1, moduleTelephony: true }, update: { moduleTelephony: true } })
    );
    expect(await res.json()).toEqual({ telephony: true, computers: false, nvr: false });
    expect(writeAudit).toHaveBeenCalled();
  });
});
