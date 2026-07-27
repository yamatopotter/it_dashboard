/**
 * @jest-environment node
 */

jest.mock("@/lib/db", () => ({
  db: {
    nvrChannelIssue: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }));

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { processChannelIssues, wasRecentlyAlerted } from "@/worker/nvr-channels";
import type { ChannelIssue } from "@/worker/monitors/nvr";

const mockDb = db as unknown as {
  nvrChannelIssue: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
};
const mockSendEmail = sendEmail as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.nvrChannelIssue.findMany.mockResolvedValue([]);
});

describe("wasRecentlyAlerted", () => {
  it("returns false when never alerted", () => {
    expect(wasRecentlyAlerted(null)).toBe(false);
  });

  it("returns true within the 2h cooldown window", () => {
    expect(wasRecentlyAlerted(new Date(Date.now() - 30 * 60 * 1000))).toBe(true);
  });

  it("returns false after the cooldown window has passed", () => {
    expect(wasRecentlyAlerted(new Date(Date.now() - 3 * 60 * 60 * 1000))).toBe(false);
  });
});

describe("processChannelIssues", () => {
  const gapIssue: ChannelIssue = {
    channel: 0, channelName: "Entrada", issueType: "gap",
    detail: "gap de 10 min", gapMinutes: 10, periodStart: new Date(), periodEnd: new Date(),
  };
  const notRecordingIssue: ChannelIssue = {
    channel: 1, channelName: "Garagem", issueType: "not_recording_now",
    detail: "parada há 60 min", gapMinutes: 60, periodStart: new Date(), periodEnd: new Date(),
  };

  it("inserts gap issues already resolved, without alerting", async () => {
    await processChannelIssues("dev-1", "NVR Teste", [gapIssue]);

    expect(mockDb.nvrChannelIssue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ issueType: "gap", resolvedAt: expect.any(Date) }) })
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("creates a new open row and sends an email for not_recording_now", async () => {
    mockDb.nvrChannelIssue.findFirst.mockResolvedValue(null);
    mockDb.nvrChannelIssue.create.mockResolvedValue({ id: "row-1", alertedAt: null });
    mockSendEmail.mockResolvedValue(undefined);

    await processChannelIssues("dev-1", "NVR Teste", [notRecordingIssue]);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockDb.nvrChannelIssue.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: { alertedAt: expect.any(Date) },
    });
  });

  it("does not re-alert within the 2h cooldown", async () => {
    const recentAlert = new Date(Date.now() - 30 * 60 * 1000);
    mockDb.nvrChannelIssue.findFirst.mockResolvedValue({ id: "row-1", alertedAt: recentAlert });
    mockDb.nvrChannelIssue.update.mockResolvedValue({ id: "row-1", alertedAt: recentAlert });

    await processChannelIssues("dev-1", "NVR Teste", [notRecordingIssue]);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("does not mark alertedAt when sendEmail fails, so the next run retries", async () => {
    mockDb.nvrChannelIssue.findFirst.mockResolvedValue(null);
    mockDb.nvrChannelIssue.create.mockResolvedValue({ id: "row-1", alertedAt: null });
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    await processChannelIssues("dev-1", "NVR Teste", [notRecordingIssue]);

    expect(mockDb.nvrChannelIssue.update).not.toHaveBeenCalled();
  });

  it("closes open issues whose channel/type did not appear this run", async () => {
    mockDb.nvrChannelIssue.findMany.mockResolvedValue([
      { id: "old-1", channel: 5, issueType: "not_recording_now" },
    ]);

    await processChannelIssues("dev-1", "NVR Teste", []);

    expect(mockDb.nvrChannelIssue.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["old-1"] } },
      data: { resolvedAt: expect.any(Date) },
    });
  });

  it("does not close an open issue whose channel/type reappeared this run", async () => {
    mockDb.nvrChannelIssue.findFirst.mockResolvedValue({ id: "row-1", alertedAt: null });
    mockDb.nvrChannelIssue.update.mockResolvedValue({ id: "row-1", alertedAt: null });
    mockDb.nvrChannelIssue.findMany.mockResolvedValue([
      { id: "row-1", channel: 1, issueType: "not_recording_now" },
    ]);

    await processChannelIssues("dev-1", "NVR Teste", [notRecordingIssue]);

    expect(mockDb.nvrChannelIssue.updateMany).not.toHaveBeenCalled();
  });
});
