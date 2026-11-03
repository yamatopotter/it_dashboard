/**
 * @jest-environment node
 */
jest.mock("@/lib/db", () => ({ db: { systemConfig: { findUnique: jest.fn() } } }));

import { db } from "@/lib/db";
import { getModules, requireModule } from "@/lib/module-config";

const find = (db as unknown as { systemConfig: { findUnique: jest.Mock } }).systemConfig.findUnique;

beforeEach(() => jest.clearAllMocks());

describe("getModules", () => {
  it("sem linha de config devolve tudo desligado", async () => {
    find.mockResolvedValue(null);
    expect(await getModules()).toEqual({ telephony: false, computers: false, nvr: false });
  });

  it("lê as flags da config", async () => {
    find.mockResolvedValue({ moduleTelephony: true, moduleComputers: false, moduleNvr: true });
    expect(await getModules()).toEqual({ telephony: true, computers: false, nvr: true });
  });
});

describe("requireModule", () => {
  it("devolve 404 quando desligado", async () => {
    find.mockResolvedValue({ moduleNvr: false });
    const res = await requireModule("nvr");
    expect(res?.status).toBe(404);
    expect(await res?.json()).toEqual({ error: "Módulo desativado" });
  });

  it("devolve null quando ligado", async () => {
    find.mockResolvedValue({ moduleComputers: true });
    expect(await requireModule("computers")).toBeNull();
  });
});
