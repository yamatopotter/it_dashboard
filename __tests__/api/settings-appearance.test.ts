/**
 * @jest-environment node
 */
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  db: {
    systemConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    user: { update: jest.fn(), findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/audit", () => ({ writeAudit: jest.fn(), extractIp: jest.fn().mockReturnValue(null) }));

import { GET, PUT } from "@/app/api/settings/appearance/route";
import { PUT as profilePUT } from "@/app/api/profile/ui/route";
import { getResolvedUi } from "@/lib/ui-pref";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

const mockAuth = auth as jest.Mock;
const d = db as unknown as {
  systemConfig: { findUnique: jest.Mock; upsert: jest.Mock };
  user: { update: jest.Mock; findUnique: jest.Mock };
};
const session = (role: string) => ({ user: { id: "u1", name: "x", role }, expires: "2099-01-01" });
const put = (body: unknown) =>
  new Request("http://localhost/api/x", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => jest.resetAllMocks());

describe("/api/settings/appearance", () => {
  it("GET 401 sem sessão", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("GET devolve padrão sem linha de config", async () => {
    mockAuth.mockResolvedValue(session("VIEWER"));
    d.systemConfig.findUnique.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ defaultUi: "tower", allowUserUi: true });
  });

  it("PUT 403 para não-admin", async () => {
    mockAuth.mockResolvedValue(session("OPERADOR"));
    expect((await PUT(put({ defaultUi: "wtop" }))).status).toBe(403);
  });

  it("PUT 400 com interface inválida", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    expect((await PUT(put({ defaultUi: "x" }))).status).toBe(400);
  });

  it("PUT salva e audita", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    d.systemConfig.upsert.mockResolvedValue({ defaultUi: "nettop", allowUserUi: false });
    const res = await PUT(put({ defaultUi: "nettop", allowUserUi: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ defaultUi: "nettop", allowUserUi: false });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ entity: "SystemConfig", action: "UPDATE" }));
  });
});

describe("PUT /api/profile/ui", () => {
  it("401 sem sessão", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await profilePUT(put({ uiPreference: "wtop" }))).status).toBe(401);
  });

  it("403 quando allowUserUi=false", async () => {
    mockAuth.mockResolvedValue(session("VIEWER"));
    d.systemConfig.findUnique.mockResolvedValue({ allowUserUi: false });
    expect((await profilePUT(put({ uiPreference: "wtop" }))).status).toBe(403);
    expect(d.user.update).not.toHaveBeenCalled();
  });

  it("400 com valor inválido", async () => {
    mockAuth.mockResolvedValue(session("VIEWER"));
    expect((await profilePUT(put({ uiPreference: "foo" }))).status).toBe(400);
  });

  it("grava a preferência e aceita null", async () => {
    mockAuth.mockResolvedValue(session("VIEWER"));
    d.systemConfig.findUnique.mockResolvedValue({ allowUserUi: true });
    expect((await profilePUT(put({ uiPreference: "wtop" }))).status).toBe(200);
    expect(d.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { uiPreference: "wtop" } });
    expect((await profilePUT(put({ uiPreference: null }))).status).toBe(200);
    expect(d.user.update).toHaveBeenLastCalledWith({ where: { id: "u1" }, data: { uiPreference: null } });
    expect(writeAudit).toHaveBeenCalled();
  });
});

describe("getResolvedUi", () => {
  it("usuário > padrão quando permitido", async () => {
    d.systemConfig.findUnique.mockResolvedValue({ defaultUi: "nettop", allowUserUi: true });
    d.user.findUnique.mockResolvedValue({ uiPreference: "wtop" });
    expect(await getResolvedUi("u1")).toBe("wtop");
  });
  it("ignora preferência quando não permitido", async () => {
    d.systemConfig.findUnique.mockResolvedValue({ defaultUi: "nettop", allowUserUi: false });
    d.user.findUnique.mockResolvedValue({ uiPreference: "wtop" });
    expect(await getResolvedUi("u1")).toBe("nettop");
  });
  it("tower sem config", async () => {
    d.systemConfig.findUnique.mockResolvedValue(null);
    expect(await getResolvedUi(null)).toBe("tower");
  });
});
