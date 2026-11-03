/**
 * @jest-environment node
 */

jest.mock("routeros", () => ({ RouterOSAPI: jest.fn() }));

import { RouterOSAPI } from "routeros";
import { withRouterOS, closeAllRouterOS, routerosPoolSize } from "@/worker/connections/routeros-pool";

const MockApi = RouterOSAPI as jest.MockedClass<typeof RouterOSAPI>;

interface FakeConn { connect: jest.Mock; close: jest.Mock; write: jest.Mock }
let conns: FakeConn[];

const target = { host: "10.0.0.1", port: 8728, user: "admin", password: "secret" };

beforeEach(async () => {
  await closeAllRouterOS();
  jest.clearAllMocks();
  conns = [];
});

// Each new connection gets the next write mock (the last one is reused)
function useConnections(...writes: jest.Mock[]) {
  let i = 0;
  MockApi.mockImplementation(() => {
    const c: FakeConn = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
      write: writes[Math.min(i++, writes.length - 1)],
    };
    conns.push(c);
    return c as unknown as InstanceType<typeof RouterOSAPI>;
  });
}

describe("RouterOS connection pool", () => {
  it("opens once and reuses the connection across calls", async () => {
    useConnections(jest.fn().mockResolvedValue([{ ok: "1" }]));
    await withRouterOS(target, (run) => run("/a"));
    await withRouterOS(target, (run) => run("/b"));
    expect(MockApi).toHaveBeenCalledTimes(1);
    expect(conns[0].connect).toHaveBeenCalledTimes(1);
    expect(conns[0].close).not.toHaveBeenCalled();
  });

  it("uses a different connection per credential", async () => {
    useConnections(jest.fn().mockResolvedValue([]));
    await withRouterOS(target, (run) => run("/a"));
    await withRouterOS({ ...target, password: "other" }, (run) => run("/a"));
    expect(MockApi).toHaveBeenCalledTimes(2);
    expect(routerosPoolSize()).toBe(2);
  });

  it("serializes commands on the same connection", async () => {
    let active = 0;
    let maxActive = 0;
    const write = jest.fn().mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return [];
    });
    useConnections(write);
    await Promise.all([
      withRouterOS(target, (run) => run("/a")),
      withRouterOS(target, (run) => run("/b")),
      withRouterOS(target, (run) => run("/c")),
    ]);
    expect(maxActive).toBe(1);
    expect(write).toHaveBeenCalledTimes(3);
    expect(MockApi).toHaveBeenCalledTimes(1);
  });

  it("reconnects and retries once when a reused connection dies", async () => {
    const dead = jest.fn()
      .mockResolvedValueOnce([{ n: "1" }])
      .mockRejectedValueOnce(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));
    const healthy = jest.fn().mockResolvedValue([{ n: "2" }]);
    useConnections(dead, healthy);

    await withRouterOS(target, (run) => run("/a"));
    const rows = await withRouterOS(target, (run) => run("/b"));

    expect(rows).toEqual([{ n: "2" }]);
    expect(MockApi).toHaveBeenCalledTimes(2);
    expect(conns[0].close).toHaveBeenCalled(); // broken connection discarded
  });

  it("does not retry on a freshly opened connection", async () => {
    const write = jest.fn().mockRejectedValue(Object.assign(new Error("boom"), { code: "ECONNRESET" }));
    useConnections(write);
    await expect(withRouterOS(target, (run) => run("/a"))).rejects.toThrow("boom");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("keeps the connection on a RouterOS trap (plain error without code)", async () => {
    const write = jest.fn()
      .mockRejectedValueOnce(new Error("not enough permissions"))
      .mockResolvedValueOnce([]);
    useConnections(write);
    await expect(withRouterOS(target, (run) => run("/a"))).rejects.toThrow("permissions");
    await withRouterOS(target, (run) => run("/b"));
    expect(MockApi).toHaveBeenCalledTimes(1);
  });

  it("closeAllRouterOS closes every pooled connection", async () => {
    useConnections(jest.fn().mockResolvedValue([]));
    await withRouterOS(target, (run) => run("/a"));
    await withRouterOS({ ...target, host: "10.0.0.2" }, (run) => run("/a"));
    await closeAllRouterOS();
    expect(conns.every((c) => c.close.mock.calls.length === 1)).toBe(true);
    expect(routerosPoolSize()).toBe(0);
  });
});
