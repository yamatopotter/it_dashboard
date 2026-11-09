/**
 * @jest-environment node
 */
jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "u1", role: "ADMIN" } }),
}));
jest.mock("@/lib/db", () => ({
  db: { systemConfig: { findUnique: jest.fn(), upsert: jest.fn() } },
}));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GET, PUT } from "@/app/api/settings/ticket/route";

const mdb = db as any;
const put = (body: unknown) =>
  new Request("http://localhost/api/settings/ticket", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.resetAllMocks();
  (auth as jest.Mock).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
  mdb.systemConfig.findUnique.mockResolvedValue({ ticketEmailTo: "ti@example.test", ticketAfterMinutes: 45 });
  mdb.systemConfig.upsert.mockImplementation(async ({ update }: any) => ({ ticketEmailTo: null, ticketAfterMinutes: 30, ...update }));
});

describe("/api/settings/ticket", () => {
  it("GET devolve a configuração", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ ticketEmailTo: "ti@example.test", ticketAfterMinutes: 45 });
  });

  it("GET devolve padrões sem configuração", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ ticketEmailTo: null, ticketAfterMinutes: 30 });
  });

  it("exige ADMIN", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "u2", role: "VIEWER" } });
    expect((await GET()).status).toBe(403);
    expect((await PUT(put({ ticketAfterMinutes: 30 }))).status).toBe(403);
  });

  it("PUT normaliza vários destinatários", async () => {
    const res = await PUT(put({ ticketEmailTo: " a@example.test ,b@example.test", ticketAfterMinutes: 60 }));
    expect(res.status).toBe(200);
    expect(mdb.systemConfig.upsert.mock.calls[0][0].update).toEqual({
      ticketEmailTo: "a@example.test, b@example.test", ticketAfterMinutes: 60,
    });
  });

  it("PUT com vazio desliga o recurso", async () => {
    await PUT(put({ ticketEmailTo: "" }));
    expect(mdb.systemConfig.upsert.mock.calls[0][0].update).toEqual({ ticketEmailTo: null });
  });

  it("PUT rejeita e-mail inválido e minutos fora da faixa", async () => {
    expect((await PUT(put({ ticketEmailTo: "nao-e-email" }))).status).toBe(400);
    expect((await PUT(put({ ticketAfterMinutes: 1 }))).status).toBe(400);
    expect(mdb.systemConfig.upsert).not.toHaveBeenCalled();
  });
});
