/**
 * @jest-environment node
 */
jest.mock("@/lib/db", () => ({
  db: {
    systemConfig: { findUnique: jest.fn(), update: jest.fn() },
    device: { findUnique: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    link: { findUnique: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock("@/lib/crypto", () => ({ decrypt: jest.fn().mockReturnValue("https://cliq.zoho.com/api/v2/bots/x/incoming?zapikey=1") }));
jest.mock("@/lib/cliq", () => ({
  ...jest.requireActual("@/lib/cliq"),
  sendCliq: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({ log: jest.fn() }));

import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { sendCliq } from "@/lib/cliq";
import { notify, resetNotifyCache } from "@/lib/notify";

const mdb = db as any;
const mSend = sendCliq as jest.Mock;

const ENT = {
  maintenanceUntil: null, offlineAcknowledgedAt: null, offlineAcknowledgedBy: null,
  offlineAcknowledgedNote: null, cliqNotifiedAt: null, cliqRenotifiedAt: null, site: "ITA",
};
const since = new Date(Date.now() - 20 * 60_000);
const openLink = { kind: "OPEN" as const, entityType: "link" as const, id: "l1", name: "Link Vivo", site: "ITA", since };
const openDev = { kind: "OPEN" as const, entityType: "device" as const, id: "d1", name: "SW1", site: "ITA", since };

beforeEach(() => {
  jest.resetAllMocks();
  resetNotifyCache();
  (decrypt as jest.Mock).mockReturnValue("https://cliq.zoho.com/api/v2/bots/x/incoming?zapikey=1");
  mdb.systemConfig.findUnique.mockResolvedValue({ cliqEnabled: true, cliqWebhookUrlEnc: "enc", cliqLastError: null });
  mdb.systemConfig.update.mockResolvedValue({});
  mdb.link.findUnique.mockResolvedValue({ ...ENT });
  mdb.device.findUnique.mockResolvedValue({ ...ENT });
  mdb.link.updateMany.mockResolvedValue({ count: 1 });
  mdb.device.updateMany.mockResolvedValue({ count: 1 });
  mdb.device.count.mockResolvedValue(4);
  mdb.link.count.mockResolvedValue(0);
  mdb.auditLog.create.mockResolvedValue({});
  mSend.mockResolvedValue(undefined);
});

describe("notify", () => {
  it("ignora quando desativado", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue({ cliqEnabled: false, cliqWebhookUrlEnc: "enc" });
    expect(await notify(openLink)).toEqual({ sent: false, reason: "disabled" });
    expect(mSend).not.toHaveBeenCalled();
  });

  it("ignora sem URL", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue({ cliqEnabled: true, cliqWebhookUrlEnc: null });
    expect((await notify(openLink)).sent).toBe(false);
  });

  it("OPEN de link envia, conta afetados, marca episódio e audita", async () => {
    const res = await notify(openLink);
    expect(res.sent).toBe(true);
    expect(mSend.mock.calls[0][1].text).toContain("4 equipamentos afetados");
    expect(mdb.link.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", cliqNotifiedAt: null }, data: { cliqNotifiedAt: expect.any(Date) },
    });
    expect(mdb.auditLog.create.mock.calls[0][0].data).toMatchObject({ username: "cliq", details: { event: "OPEN", ok: true } });
  });

  it("não repete no mesmo episódio", async () => {
    mdb.link.findUnique.mockResolvedValue({ ...ENT, cliqNotifiedAt: new Date() });
    expect(await notify(openLink)).toEqual({ sent: false, reason: "already-notified" });
    mdb.link.findUnique.mockResolvedValue({ ...ENT });
    mdb.link.updateMany.mockResolvedValue({ count: 0 });
    expect((await notify(openLink)).reason).toBe("already-notified");
    expect(mSend).not.toHaveBeenCalled();
  });

  it("respeita manutenção", async () => {
    mdb.link.findUnique.mockResolvedValue({ ...ENT, maintenanceUntil: new Date(Date.now() + 3_600_000) });
    expect((await notify(openLink)).reason).toBe("maintenance");
    expect(mSend).not.toHaveBeenCalled();
  });

  it("equipamento atrás de link caído da mesma unidade não notifica", async () => {
    mdb.link.count.mockResolvedValue(1);
    expect((await notify(openDev)).reason).toBe("grouped");
    expect(mSend).not.toHaveBeenCalled();
  });

  it("WARN recente (<15 min) não avisa; antigo avisa", async () => {
    const recent = { ...openDev, severity: "WARN" as const, since: new Date(Date.now() - 5 * 60_000) };
    expect((await notify(recent)).reason).toBe("warn-too-recent");
    expect((await notify({ ...recent, since: new Date(Date.now() - 20 * 60_000) })).sent).toBe(true);
  });

  it("falha de envio audita, grava cliqLastError e libera o episódio", async () => {
    mSend.mockRejectedValue(new Error("HTTP 500"));
    expect(await notify(openLink)).toEqual({ sent: false, reason: "send-failed" });
    expect(mdb.systemConfig.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { cliqLastError: "HTTP 500" } });
    expect(mdb.auditLog.create.mock.calls[0][0].data.details).toMatchObject({ ok: false, error: "HTTP 500" });
    expect(mdb.link.updateMany).toHaveBeenLastCalledWith({ where: { id: "l1" }, data: { cliqNotifiedAt: null } });
  });

  it("RENOTIFY: uma vez, sem ack", async () => {
    const notified = new Date(Date.now() - 20 * 60_000);
    const ev = { kind: "RENOTIFY" as const, entityType: "link" as const, id: "l1", name: "L", site: "ITA", since: notified };

    mdb.link.findUnique.mockResolvedValue({ ...ENT, cliqNotifiedAt: notified, offlineAcknowledgedAt: new Date() });
    expect((await notify(ev)).reason).toBe("acked");

    mdb.link.findUnique.mockResolvedValue({ ...ENT, cliqNotifiedAt: notified, cliqRenotifiedAt: new Date() });
    expect((await notify(ev)).reason).toBe("already-renotified");
    expect(mSend).not.toHaveBeenCalled();

    mdb.link.findUnique.mockResolvedValue({ ...ENT, cliqNotifiedAt: notified });
    expect((await notify(ev)).sent).toBe(true);
    expect(mSend.mock.calls[0][1].text).toContain("continua fora");
  });

  it("RECOVER: avisa com ack e limpa o episódio", async () => {
    mdb.device.findUnique.mockResolvedValue({
      ...ENT, cliqNotifiedAt: new Date(Date.now() - 23 * 60_000), offlineAcknowledgedBy: "fulano", offlineAcknowledgedNote: "nota",
    });
    const res = await notify({ kind: "RECOVER", entityType: "device", id: "d1", name: "SW1", site: "ITA" });
    expect(res.sent).toBe(true);
    expect(mSend.mock.calls[0][1].text).toContain("Ack: fulano, nota");
    expect(mdb.device.updateMany).toHaveBeenCalledWith({ where: { id: "d1" }, data: { cliqNotifiedAt: null, cliqRenotifiedAt: null } });
  });

  it("RECOVER sem aviso prévio não envia", async () => {
    const res = await notify({ kind: "RECOVER", entityType: "device", id: "d1", name: "SW1" });
    expect(res).toEqual({ sent: false, reason: "not-notified" });
  });

  it("WORKER_STALE envia sem consultar entidade", async () => {
    const res = await notify({ kind: "WORKER_STALE", minutes: 9 });
    expect(res.sent).toBe(true);
    expect(mdb.device.findUnique).not.toHaveBeenCalled();
  });

  it("cache de 30 s da configuração", async () => {
    await notify({ kind: "WORKER_STALE", minutes: 9 });
    await notify({ kind: "WORKER_STALE", minutes: 10 });
    expect(mdb.systemConfig.findUnique).toHaveBeenCalledTimes(1);
  });
});
