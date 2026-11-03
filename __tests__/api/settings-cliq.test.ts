/**
 * @jest-environment node
 */
jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "u1", role: "ADMIN" } }),
}));
jest.mock("@/lib/db", () => ({
  db: { systemConfig: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() } },
}));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn() }));
jest.mock("@/lib/crypto", () => ({
  encrypt: jest.fn((s: string) => `enc(${s})`),
  decrypt: jest.fn((s: string) => s.replace(/^enc\(|\)$/g, "")),
}));
jest.mock("@/lib/cliq", () => ({
  ...jest.requireActual("@/lib/cliq"),
  sendCliq: jest.fn(),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { sendCliq } from "@/lib/cliq";
import { GET, PUT } from "@/app/api/settings/cliq/route";
import { POST as TEST } from "@/app/api/settings/cliq/test/route";

const mdb = db as any;
const URL_OK = "https://cliq.zoho.com/api/v2/bots/x/incoming?zapikey=1";

const put = (body: unknown) =>
  new Request("http://localhost/api/settings/cliq", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.resetAllMocks();
  (auth as jest.Mock).mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
  (encrypt as jest.Mock).mockImplementation((s: string) => `enc(${s})`);
  (decrypt as jest.Mock).mockImplementation((s: string) => s.replace(/^enc\(|\)$/g, ""));
  mdb.systemConfig.findUnique.mockResolvedValue({
    cliqEnabled: true, cliqWebhookUrlEnc: "enc(secret)", cliqChannel: "TI", cliqRenotifyMinutes: 15,
    cliqLastTestAt: null, cliqLastError: null,
  });
  mdb.systemConfig.upsert.mockImplementation(async ({ update }: any) => ({
    cliqEnabled: true, cliqWebhookUrlEnc: update.cliqWebhookUrlEnc ?? "enc(secret)", cliqChannel: "TI", cliqRenotifyMinutes: 15,
  }));
  mdb.systemConfig.update.mockResolvedValue({});
});

describe("GET /api/settings/cliq", () => {
  it("nunca devolve a URL", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.hasWebhook).toBe(true);
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.cliqChannel).toBe("TI");
  });

  it("padrões sem configuração", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue(null);
    const body = await (await GET()).json();
    expect(body).toMatchObject({ cliqEnabled: false, hasWebhook: false, cliqRenotifyMinutes: 15 });
  });

  it("bloqueia não-admin", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "u2", role: "VIEWER" } });
    expect((await GET()).status).toBeGreaterThanOrEqual(401);
  });
});

describe("PUT /api/settings/cliq", () => {
  it("cifra a URL válida", async () => {
    const res = await PUT(put({ cliqWebhookUrl: URL_OK, cliqEnabled: true }));
    expect(res.status).toBe(200);
    expect(mdb.systemConfig.upsert.mock.calls[0][0].update).toMatchObject({
      cliqWebhookUrlEnc: `enc(${URL_OK})`, cliqEnabled: true,
    });
    expect(JSON.stringify(await res.json())).not.toContain("zapikey");
  });

  it("rejeita URL fora do Zoho (SSRF)", async () => {
    const res = await PUT(put({ cliqWebhookUrl: "http://127.0.0.1/x" }));
    expect(res.status).toBe(400);
    expect(mdb.systemConfig.upsert).not.toHaveBeenCalled();
  });

  it("URL vazia limpa o webhook", async () => {
    await PUT(put({ cliqWebhookUrl: "" }));
    expect(mdb.systemConfig.upsert.mock.calls[0][0].update.cliqWebhookUrlEnc).toBeNull();
  });

  it("valida minutos de reaviso", async () => {
    expect((await PUT(put({ cliqRenotifyMinutes: 0 }))).status).toBe(400);
    expect((await PUT(put({ cliqRenotifyMinutes: 30 }))).status).toBe(200);
  });
});

describe("POST /api/settings/cliq/test", () => {
  it("400 sem webhook configurado", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue({ cliqWebhookUrlEnc: null });
    expect((await TEST()).status).toBe(400);
  });

  it("envia a mensagem de teste e registra cliqLastTestAt", async () => {
    (sendCliq as jest.Mock).mockResolvedValue(undefined);
    const res = await TEST();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect((sendCliq as jest.Mock).mock.calls[0][1]).toBe("✅ Mensagem de teste do WatchIT");
    expect(mdb.systemConfig.update.mock.calls[0][0].data).toMatchObject({ cliqLastError: null });
  });

  it("devolve erro legível e grava cliqLastError", async () => {
    (sendCliq as jest.Mock).mockRejectedValue(new Error("Zoho Cliq respondeu HTTP 400."));
    const res = await TEST();
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ ok: false, error: "Zoho Cliq respondeu HTTP 400." });
    expect(mdb.systemConfig.update.mock.calls[0][0].data.cliqLastError).toBe("Zoho Cliq respondeu HTTP 400.");
  });
});
