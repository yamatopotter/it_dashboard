/**
 * @jest-environment node
 */

jest.mock("routeros", () => ({
  RouterOSAPI: jest.fn(),
}));

import { RouterOSAPI } from "routeros";
import { checkLinkTraffic, resetLinkSamples } from "@/worker/monitors/link-traffic";
import { closeAllRouterOS } from "@/worker/connections/routeros-pool";

const MockRouterOSAPI = RouterOSAPI as jest.MockedClass<typeof RouterOSAPI>;

let mockConnect: jest.Mock;
let mockClose: jest.Mock;
let mockWrite: jest.Mock;

beforeEach(async () => {
  await closeAllRouterOS();
  resetLinkSamples();
  jest.clearAllMocks();
  jest.useFakeTimers();

  mockConnect = jest.fn().mockResolvedValue(undefined);
  mockClose   = jest.fn();
  mockWrite   = jest.fn();

  MockRouterOSAPI.mockImplementation(() => ({
    connect: mockConnect,
    close:   mockClose,
    write:   mockWrite,
  }) as unknown as InstanceType<typeof RouterOSAPI>);
});

afterEach(() => {
  jest.useRealTimers();
});

function makeSample(rx: number, tx: number) {
  return [{ name: "ether1", "rx-byte": String(rx), "tx-byte": String(tx) }];
}

describe("checkLinkTraffic", () => {
  it("calculates downloadBps and uploadBps from byte delta", async () => {
    // before: rx=1000, tx=500 / after: rx=2000, tx=1500
    // delta rx = 1000 bytes → 8000 bits/s; delta tx = 1000 bytes → 8000 bits/s
    mockWrite
      .mockResolvedValueOnce(makeSample(1000, 500))
      .mockResolvedValueOnce(makeSample(2000, 1500));

    const resultPromise = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.downloadBps).toBe(8000);
    expect(result.uploadBps).toBe(8000);
  });

  it("returns 0 when counters decrease (counter reset protection)", async () => {
    mockWrite
      .mockResolvedValueOnce(makeSample(5000, 5000))
      .mockResolvedValueOnce(makeSample(100, 100)); // counter reset

    const resultPromise = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.downloadBps).toBe(0);
    expect(result.uploadBps).toBe(0);
  });

  it("throws when the interface is not found on the device", async () => {
    // Error is thrown on the first readCounters() call, before the sleep timer fires
    mockWrite.mockResolvedValue([{ name: "ether2", "rx-byte": "0", "tx-byte": "0" }]);

    await expect(
      checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1")
    ).rejects.toThrow("ether1");
  });

  it("keeps the connection open after a call and closes it on closeAllRouterOS()", async () => {
    mockWrite
      .mockResolvedValueOnce(makeSample(0, 0))
      .mockResolvedValueOnce(makeSample(100, 100));

    const resultPromise = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    await resultPromise;

    expect(mockClose).not.toHaveBeenCalled();
    await closeAllRouterOS();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("does not leak the pooled connection when the interface is missing (closed by closeAll)", async () => {
    mockWrite.mockResolvedValue([{ name: "ether2", "rx-byte": "0", "tx-byte": "0" }]);

    await expect(
      checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1")
    ).rejects.toThrow("ether1");

    await closeAllRouterOS();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("second tick computes the rate from the previous sample with real elapsed time (no 1 s sleep)", async () => {
    mockWrite
      .mockResolvedValueOnce(makeSample(0, 0))          // tick 1 first read
      .mockResolvedValueOnce(makeSample(1000, 1000))    // tick 1 fallback read
      .mockResolvedValueOnce(makeSample(61000, 31000)); // tick 2: single read

    const p1 = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    await p1;

    jest.advanceTimersByTime(60_000);
    const writesBefore = mockWrite.mock.calls.length;
    const r2 = await checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");

    expect(mockWrite.mock.calls.length - writesBefore).toBe(1);
    // 60000 bytes in 60 s → 8000 bps; 30000 bytes → 4000 bps
    expect(r2.downloadBps).toBe(8000);
    expect(r2.uploadBps).toBe(4000);
    expect(mockConnect).toHaveBeenCalledTimes(1); // connection reused
  });

  it("falls back to the double read when the counter regressed between ticks", async () => {
    mockWrite
      .mockResolvedValueOnce(makeSample(5000, 5000))
      .mockResolvedValueOnce(makeSample(6000, 6000))
      .mockResolvedValueOnce(makeSample(100, 100))    // tick 2: counter reset
      .mockResolvedValueOnce(makeSample(1100, 1100)); // tick 2 fallback read

    const p1 = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    await p1;
    jest.advanceTimersByTime(60_000);

    const p2 = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    const r2 = await p2;

    expect(r2.downloadBps).toBe(8000); // 1000 bytes in the 1 s fallback window
  });

  it("falls back to the double read when the previous sample is too old", async () => {
    mockWrite
      .mockResolvedValueOnce(makeSample(0, 0))
      .mockResolvedValueOnce(makeSample(1000, 1000))
      .mockResolvedValueOnce(makeSample(9_000_000, 9_000_000))
      .mockResolvedValueOnce(makeSample(9_001_000, 9_001_000));

    const p1 = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    await p1;
    jest.advanceTimersByTime(10 * 60_000);

    const p2 = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    const r2 = await p2;
    expect(r2.downloadBps).toBe(8000);
  });

  it("reads interface counters twice separated by the 1-second interval", async () => {
    mockWrite
      .mockResolvedValueOnce(makeSample(0, 0))
      .mockResolvedValueOnce(makeSample(125000, 62500));

    const resultPromise = checkLinkTraffic("192.168.1.1", "admin", "pass", 8728, "ether1");
    await jest.advanceTimersByTimeAsync(1000);
    await resultPromise;

    expect(mockWrite).toHaveBeenCalledTimes(2);
  });
});
