/**
 * @jest-environment node
 */

jest.mock("net-snmp", () => ({
  createSession: jest.fn(),
  isVarbindError: jest.fn().mockReturnValue(false),
  Version2c: 1,
}));

import * as snmpModule from "net-snmp";
import { checkSnmp } from "@/worker/monitors/snmp";

const mockCreateSession = snmpModule.createSession as jest.Mock;
const mockIsVarbindError = snmpModule.isVarbindError as jest.Mock;

const OID_CPU = "1.3.6.1.2.1.25.3.3.1.2.1";
const OID_UPTIME = "1.3.6.1.2.1.1.3.0";
const OID_STORAGE_USED = "1.3.6.1.2.1.25.2.3.1.6.65536";
const OID_STORAGE_SIZE = "1.3.6.1.2.1.25.2.3.1.5.65536";

let mockGet: jest.Mock;
let mockClose: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGet = jest.fn();
  mockClose = jest.fn();
  mockIsVarbindError.mockReturnValue(false);
  mockCreateSession.mockReturnValue({ get: mockGet, close: mockClose });
});

function makeVarbinds(data: Record<string, number>) {
  return Object.entries(data).map(([oid, value]) => ({ oid, value }));
}

describe("checkSnmp", () => {
  it("returns cpuLoad, memoryUsed, and uptime from valid SNMP response", async () => {
    mockGet.mockImplementation((_oids: string[], cb: Function) => {
      cb(null, makeVarbinds({
        [OID_CPU]: 35,
        [OID_UPTIME]: 360000, // 3600 seconds = 1h
        [OID_STORAGE_USED]: 500,
        [OID_STORAGE_SIZE]: 1000,
      }));
    });

    const result = await checkSnmp("192.168.1.1", "public", 161);

    expect(result.cpuLoad).toBe(35);
    expect(result.uptime).toBe(3600); // ticks / 100
    expect(result.memoryUsed).toBeCloseTo(50); // 500/1000 * 100
  });

  it("returns nulls when SNMP session errors", async () => {
    mockGet.mockImplementation((_oids: string[], cb: Function) => {
      cb(new Error("Timeout"), undefined);
    });

    const result = await checkSnmp("192.168.1.1", "public", 161);

    expect(result.cpuLoad).toBeNull();
    expect(result.memoryUsed).toBeNull();
    expect(result.uptime).toBeNull();
  });

  it("skips OID values with varbind errors", async () => {
    mockIsVarbindError.mockImplementation((vb: { oid: string }) => vb.oid === OID_CPU);

    mockGet.mockImplementation((_oids: string[], cb: Function) => {
      cb(null, makeVarbinds({
        [OID_CPU]: 99,
        [OID_UPTIME]: 100,
        [OID_STORAGE_USED]: 200,
        [OID_STORAGE_SIZE]: 400,
      }));
    });

    const result = await checkSnmp("192.168.1.1", "public", 161);

    expect(result.cpuLoad).toBeNull(); // skipped due to varbind error
    expect(result.uptime).toBe(1);
    expect(result.memoryUsed).toBeCloseTo(50);
  });

  it("returns memoryUsed=null when storage size is zero", async () => {
    mockGet.mockImplementation((_oids: string[], cb: Function) => {
      cb(null, makeVarbinds({
        [OID_CPU]: 10,
        [OID_UPTIME]: 100,
        [OID_STORAGE_USED]: 0,
        [OID_STORAGE_SIZE]: 0,
      }));
    });

    const result = await checkSnmp("192.168.1.1", "public", 161);

    expect(result.memoryUsed).toBeNull();
  });

  it("closes the SNMP session even on success", async () => {
    mockGet.mockImplementation((_oids: string[], cb: Function) => {
      cb(null, []);
    });

    await checkSnmp("192.168.1.1");

    expect(mockClose).toHaveBeenCalled();
  });
});
