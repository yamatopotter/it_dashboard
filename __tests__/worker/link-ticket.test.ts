/**
 * @jest-environment node
 */
jest.mock("@/lib/db", () => ({
  db: {
    systemConfig: { findUnique: jest.fn() },
    link: { findMany: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/logger", () => ({ log: jest.fn() }));

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { checkLinkTickets } from "@/worker/link-ticket";

const mdb = db as any;
const mockSend = sendEmail as jest.Mock;

const cfg = {
  ticketEmailTo: "ti@example.test", ticketAfterMinutes: 30,
  smtpEnabled: true, smtpHost: "smtp.example.test", smtpUser: "u",
};
const link = (over: Record<string, unknown> = {}) => ({
  id: "l1", name: "Link A", location: "Matriz", site: "BAR", isOnline: false,
  lastEventAt: new Date(Date.now() - 45 * 60_000), ticketOpenedAt: null,
  ...over,
});

beforeEach(() => {
  jest.resetAllMocks();
  mdb.systemConfig.findUnique.mockResolvedValue(cfg);
  mdb.link.findMany.mockResolvedValue([link()]);
  mdb.link.updateMany.mockResolvedValue({ count: 1 });
  mdb.auditLog.create.mockResolvedValue({});
  mockSend.mockResolvedValue(undefined);
});

describe("checkLinkTickets", () => {
  it("abre o chamado por e-mail para link fora além do limite", async () => {
    await checkLinkTickets();
    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe("ti@example.test");
    expect(arg.subject).toMatch(/^\[WatchIT\] Link Link A fora há 4\d min$/);
    expect(arg.text).toContain("Matriz");
    expect(mdb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entity: "LinkTicket", details: { ok: true } }),
    }));
  });

  it("consulta só links elegíveis: offline, sem chamado, sem ack, fora de manutenção, além do limite", async () => {
    await checkLinkTickets();
    const where = mdb.link.findMany.mock.calls[0][0].where;
    expect(where.isOnline).toBe(false);
    expect(where.ticketOpenedAt).toBeNull();
    expect(where.offlineAcknowledgedAt).toBeNull();
    expect(where.OR).toEqual([{ maintenanceUntil: null }, { maintenanceUntil: { lte: expect.any(Date) } }]);
    const boundary = where.lastEventAt.lte as Date;
    expect(Date.now() - boundary.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
    expect(Date.now() - boundary.getTime()).toBeLessThan(30 * 60_000 + 5000);
  });

  it("respeita ticketAfterMinutes configurado", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue({ ...cfg, ticketAfterMinutes: 60 });
    await checkLinkTickets();
    const boundary = mdb.link.findMany.mock.calls[0][0].where.lastEventAt.lte as Date;
    expect(Date.now() - boundary.getTime()).toBeGreaterThanOrEqual(60 * 60_000 - 1000);
  });

  it("não envia nada quando nenhum link está elegível (antes do limite)", async () => {
    mdb.link.findMany.mockResolvedValue([]);
    await checkLinkTickets();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("não duplica: se outro ciclo já reivindicou, não envia", async () => {
    mdb.link.updateMany
      .mockResolvedValueOnce({ count: 0 }) // limpeza de links online
      .mockResolvedValueOnce({ count: 0 }); // reivindicação perdida
    await checkLinkTickets();
    expect(mockSend).not.toHaveBeenCalled();
    expect(mdb.link.updateMany).toHaveBeenCalledWith({
      where: { id: "l1", ticketOpenedAt: null },
      data: { ticketOpenedAt: expect.any(Date) },
    });
  });

  it("desfaz a reivindicação e audita quando o envio falha", async () => {
    mockSend.mockRejectedValue(new Error("smtp down"));
    await checkLinkTickets();
    expect(mdb.link.updateMany).toHaveBeenLastCalledWith({ where: { id: "l1" }, data: { ticketOpenedAt: null } });
    expect(mdb.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ details: { ok: false, error: "smtp down" } }),
    }));
  });

  it("limpa ticketOpenedAt dos links que voltaram", async () => {
    await checkLinkTickets();
    expect(mdb.link.updateMany).toHaveBeenCalledWith({
      where: { isOnline: true, ticketOpenedAt: { not: null } },
      data: { ticketOpenedAt: null },
    });
  });

  it("não faz nada sem destinatário", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue({ ...cfg, ticketEmailTo: "  " });
    await checkLinkTickets();
    expect(mdb.link.findMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("não faz nada com SMTP desligado ou incompleto", async () => {
    mdb.systemConfig.findUnique.mockResolvedValue({ ...cfg, smtpEnabled: false });
    await checkLinkTickets();
    mdb.systemConfig.findUnique.mockResolvedValue({ ...cfg, smtpHost: null });
    await checkLinkTickets();
    expect(mdb.link.findMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("nunca lança, mesmo com erro no banco", async () => {
    mdb.systemConfig.findUnique.mockRejectedValue(new Error("db"));
    await expect(checkLinkTickets()).resolves.toBeUndefined();
  });
});
