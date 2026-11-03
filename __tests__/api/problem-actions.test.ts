/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { POST as linkAck, DELETE as linkUnack } from "@/app/api/links/[id]/ack/route";
import { POST as linkSilence, DELETE as linkUnsilence } from "@/app/api/links/[id]/silence/route";
import { POST as devSilence, DELETE as devUnsilence } from "@/app/api/devices/[id]/silence/route";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn(), extractIp: jest.fn().mockReturnValue(null) }));
jest.mock("@/lib/db", () => ({
  db: { link: { update: jest.fn() }, device: { update: jest.fn() } },
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as unknown as { link: { update: jest.Mock }; device: { update: jest.Mock } };
const as = (role: string) => mockAuth.mockResolvedValue({ user: { id: "u", name: "ana", role }, expires: "2099-01-01" } as never);
const P = { params: Promise.resolve({ id: "x1" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/x", { method, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.link.update.mockResolvedValue({ id: "x1", name: "Vivo" });
  mockDb.device.update.mockResolvedValue({ id: "x1", name: "SW" });
});

describe("ações sobre problemas", () => {
  it("401 sem sessão e 403 para VIEWER", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await linkAck(req("POST", {}), P)).status).toBe(401);
    expect((await linkSilence(req("POST", { minutes: 60 }), P)).status).toBe(401);
    expect((await devSilence(req("POST", { minutes: 60 }), P)).status).toBe(401);
    as("VIEWER");
    expect((await linkAck(req("POST", {}), P)).status).toBe(403);
    expect((await linkUnsilence(req("DELETE"), P)).status).toBe(403);
    expect((await devUnsilence(req("DELETE"), P)).status).toBe(403);
  });

  it("ack de link grava autor, nota e auditoria; DELETE limpa", async () => {
    as("OPERADOR");
    expect((await linkAck(req("POST", { note: " operadora avisada " }), P)).status).toBe(200);
    const data = mockDb.link.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ offlineAcknowledgedBy: "ana", offlineAcknowledgedNote: "operadora avisada" });
    expect(data.offlineAcknowledgedAt).toBeInstanceOf(Date);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ entity: "Link", entityId: "x1" }));
    expect((await linkUnack(req("DELETE"), P)).status).toBe(200);
    expect(mockDb.link.update.mock.calls[1][0].data).toEqual({ offlineAcknowledgedAt: null, offlineAcknowledgedBy: null, offlineAcknowledgedNote: null });
  });

  it("ack de link inexistente => 404", async () => {
    as("ADMIN");
    mockDb.link.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("nf", { code: "P2025", clientVersion: "7" }));
    expect((await linkAck(req("POST", {}), P)).status).toBe(404);
  });

  it.each([[60, 200], [240, 200], [720, 200], [90, 200], [1440, 200], [0, 400], [1441, 400], [1.5, 400], ["60", 400]])(
    "silence minutes=%p => %i", async (minutes, status) => {
      as("OPERADOR");
      const res = await linkSilence(req("POST", { minutes }), P);
      expect(res.status).toBe(status);
      if (status === 200) {
        const until: Date = mockDb.link.update.mock.calls[0][0].data.maintenanceUntil;
        expect(until.getTime()).toBeGreaterThan(Date.now() + (minutes as number) * 60_000 - 5_000);
        expect(writeAudit).toHaveBeenCalled();
      } else {
        expect(mockDb.link.update).not.toHaveBeenCalled();
      }
    });

  it("silence de dispositivo e DELETE limpam maintenanceUntil", async () => {
    as("OPERADOR");
    expect((await devSilence(req("POST", { minutes: 60 }), P)).status).toBe(200);
    expect(mockDb.device.update.mock.calls[0][0].data.maintenanceUntil).toBeInstanceOf(Date);
    expect((await devUnsilence(req("DELETE"), P)).status).toBe(200);
    expect(mockDb.device.update.mock.calls[1][0].data).toEqual({ maintenanceUntil: null });
    expect((await linkUnsilence(req("DELETE"), P)).status).toBe(200);
    expect(mockDb.link.update.mock.calls[0][0].data).toEqual({ maintenanceUntil: null });
  });

  it("JSON malformado => 400", async () => {
    as("OPERADOR");
    const bad = new NextRequest("http://localhost/x", { method: "POST", body: "{nope" });
    expect((await linkSilence(bad, P)).status).toBe(400);
  });
});
