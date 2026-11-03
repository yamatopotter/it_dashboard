/**
 * @jest-environment node
 *
 * Tests the alert path inside the scheduler's safeRun: when a device reaches
 * alertThreshold consecutive failures it calls notify(OPEN) once (dedupe per
 * episode lives in notify), and notify(RECOVER) when it comes back online.
 */
import type { Device } from "@prisma/client";

jest.mock("@/lib/db", () => ({
  db: {
    device:          { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    deviceStatus:    { upsert: jest.fn() },
    statusHistory:   { create: jest.fn(), deleteMany: jest.fn() },
    linkEvent:       { deleteMany: jest.fn() },
    tokenBlacklist:  { deleteMany: jest.fn() },
    link:            { findMany: jest.fn(), update: jest.fn() },
    workerHeartbeat: { upsert: jest.fn() },
    systemConfig:    { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
    $transaction:    jest.fn(),
  },
}));

jest.mock("@/worker/monitors/ping",         () => ({ checkPing:        jest.fn() }));
jest.mock("@/worker/monitors/http",         () => ({ checkHttp:        jest.fn() }));
jest.mock("@/worker/monitors/snmp",         () => ({ checkSnmp:        jest.fn() }));
jest.mock("@/worker/monitors/routeros",     () => ({ checkRouterOS:    jest.fn() }));
jest.mock("@/worker/monitors/unifi",        () => ({ checkUnifi:       jest.fn() }));
jest.mock("@/worker/monitors/omada",        () => ({ checkOmada:       jest.fn() }));
jest.mock("@/worker/monitors/link-traffic", () => ({ checkLinkTraffic: jest.fn() }));
jest.mock("@/lib/notify", () => ({ notify: jest.fn().mockResolvedValue({ sent: true }) }));
jest.mock("@/lib/crypto", () => ({
  resolveRouterosCredentials: jest.fn().mockReturnValue(null),
  resolveSnmpCommunity:       jest.fn().mockReturnValue("public"),
  resolveUnifiApiKey:         jest.fn().mockReturnValue(null),
  resolveUnifiCredentials:    jest.fn().mockReturnValue(null),
  resolveOmadaCredentials:    jest.fn().mockReturnValue(null),
}));

import { db } from "@/lib/db";
import { checkPing } from "@/worker/monitors/ping";
import { notify } from "@/lib/notify";
import { startScheduler, shutdown } from "@/worker/scheduler";

const mockDb        = db as jest.Mocked<typeof db>;
const mockCheckPing = checkPing as jest.Mock;
const mockNotify    = notify as jest.Mock;

const baseDevice: Device = {
  id: "1", name: "Router", ip: "10.0.0.1", type: "MIKROTIK",
  location: null, notes: null,
  pingEnabled: true, httpEnabled: false, httpPort: null, httpPath: "/",
  snmpEnabled: false, snmpCommunity: "public", snmpCommunityEnc: null, snmpPort: 161,
  routerosEnabled: false, routerosUserEnc: null, routerosPassEnc: null, routerosPort: 8728,
  unifiEnabled: false, unifiAuthMethod: "apikey", unifiApiKeyEnc: null, unifiUserEnc: null,
  unifiPassEnc: null, unifiPort: 443, unifiSite: "default", unifiTlsVerify: false, unifiControllerIp: null,
  omadaEnabled: false, omadaClientIdEnc: null, omadaClientSecretEnc: null, omadacId: null,
  omadaSite: null, omadaSiteId: null, omadaTlsVerify: true, omadaControllerIp: null,
  nvrEnabled: false, nvrUserEnc: null, nvrPassEnc: null, nvrPort: 80, nvrUseHttps: false,
  nvrMaxGapMinutes: 5, nvrHoursWindow: 24, nvrCheckIntervalMinutes: 1440,
  parentNvrId: null, parentNvrChannel: null,
  checkInterval: 60, maintenanceUntil: null,
  alertWebhookUrl: null, alertThreshold: 2, lastAlertAt: null,
  offlineAcknowledgedAt: null, offlineAcknowledgedBy: null, offlineAcknowledgedNote: null,
  macAddress: null, snmpCustomOids: null,
  createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});

  (mockDb.$transaction as jest.Mock).mockResolvedValue([]);
  (mockDb.deviceStatus.upsert as jest.Mock).mockResolvedValue({});
  (mockDb.statusHistory.create as jest.Mock).mockResolvedValue({});
  (mockDb.statusHistory.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.linkEvent.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.tokenBlacklist.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
  (mockDb.link.findMany as jest.Mock).mockResolvedValue([]);
  (mockDb.workerHeartbeat.upsert as jest.Mock).mockResolvedValue({});
  (mockDb.systemConfig.upsert as jest.Mock).mockResolvedValue({ id: 1, statusHistoryDays: 30, linkEventDays: 90, lastCleanupAt: null });
  (mockDb.systemConfig.update as jest.Mock).mockResolvedValue({});
  (mockDb.device.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  // Device is always offline → failures accumulate
  mockCheckPing.mockResolvedValue({ alive: false, responseMs: null });
});

afterEach(async () => {
  jest.useRealTimers();
  await shutdown(200);
  jest.restoreAllMocks();
});

async function flush() {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

describe("scheduler alert path", () => {
  it("calls notify(OPEN) once when failures reach alertThreshold", async () => {
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([baseDevice]); // threshold 2

    await startScheduler();
    await flush(); // immediate check -> fails = 1

    expect(mockNotify).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000); // tick 2 -> fails = 2 === threshold
    await flush();

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ kind: "OPEN", entityType: "device", id: "1", name: "Router" });

    // Further ticks (fails > threshold) do not re-alert
    await jest.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("calls notify(RECOVER) when a failing device comes back online", async () => {
    (mockDb.device.findMany as jest.Mock).mockResolvedValue([baseDevice]);

    await startScheduler();
    await flush(); // fails = 1
    mockCheckPing.mockResolvedValue({ alive: true, responseMs: 5 });
    await jest.advanceTimersByTimeAsync(60_000);
    await flush();

    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: "RECOVER", id: "1" }));
  });
});
