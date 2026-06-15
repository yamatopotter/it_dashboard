/**
 * @jest-environment node
 */

jest.mock("routeros", () => ({
  RouterOSAPI: jest.fn(),
}));

import { RouterOSAPI } from "routeros";
import { checkRouterOS } from "@/worker/monitors/routeros";

const MockRouterOSAPI = RouterOSAPI as jest.MockedClass<typeof RouterOSAPI>;

let mockConnect: jest.Mock;
let mockClose: jest.Mock;
let mockWrite: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect = jest.fn().mockResolvedValue(undefined);
  mockClose   = jest.fn();
  mockWrite   = jest.fn();

  MockRouterOSAPI.mockImplementation(() => ({
    connect: mockConnect,
    close:   mockClose,
    write:   mockWrite,
  }) as unknown as InstanceType<typeof RouterOSAPI>);
});

describe("checkRouterOS", () => {
  it("returns uptime, cpuLoad, memoryUsed, and clients from resource + lease data", async () => {
    mockWrite
      .mockResolvedValueOnce([{
        "uptime":        "1d2h3m4s",
        "cpu-load":      "45",
        "total-memory":  "134217728",
        "free-memory":   "67108864",
      }])
      .mockResolvedValueOnce([
        { "mac-address": "AA:BB:CC:DD:EE:01", address: "192.168.1.10", "host-name": "Phone",  status: "bound", server: "dhcp1" },
        { "mac-address": "AA:BB:CC:DD:EE:02", address: "192.168.1.11", "host-name": "Laptop", status: "bound", server: "dhcp1" },
        { "mac-address": "AA:BB:CC:DD:EE:03", address: "192.168.1.12", "host-name": "Old",    status: "waiting" },
      ]);

    const result = await checkRouterOS("192.168.1.1", "admin", "password");

    // 1d2h3m4s = 86400 + 7200 + 180 + 4 = 93784
    expect(result.uptime).toBe(93784);
    expect(result.cpuLoad).toBe(45);
    expect(result.memoryUsed).toBeCloseTo(50);

    // only "bound" leases
    expect(result.clients).toHaveLength(2);
    expect(result.clients[0]).toEqual({ mac: "AA:BB:CC:DD:EE:01", ip: "192.168.1.10", hostname: "Phone",  server: "dhcp1" });
    expect(result.clients[1]).toEqual({ mac: "AA:BB:CC:DD:EE:02", ip: "192.168.1.11", hostname: "Laptop", server: "dhcp1" });
    expect(result.dhcpError).toBeNull();
    expect(result.rawLeaseCount).toBe(3);
    expect(result.leaseStatuses).toEqual(["bound", "waiting"]);
  });

  it("returns empty clients array when no DHCP server is configured", async () => {
    mockWrite
      .mockResolvedValueOnce([{
        "uptime":       "1h",
        "cpu-load":     "10",
        "total-memory": "100",
        "free-memory":  "80",
      }])
      .mockRejectedValueOnce(new Error("no such command"));

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(result.clients).toEqual([]);
    expect(result.cpuLoad).toBe(10);
    expect(result.dhcpError).toMatch(/no such command/);
    expect(result.rawLeaseCount).toBe(0);
  });

  it("returns empty clients array when no leases are bound", async () => {
    mockWrite
      .mockResolvedValueOnce([{
        "uptime":       "2h",
        "cpu-load":     "5",
        "total-memory": "200",
        "free-memory":  "100",
      }])
      .mockResolvedValueOnce([
        { "mac-address": "AA:BB:CC:DD:EE:01", address: "10.0.0.2", "host-name": "Device", status: "waiting" },
      ]);

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(result.clients).toEqual([]);
  });

  it("throws when connection fails", async () => {
    mockConnect.mockRejectedValue(new Error("Connection refused"));

    await expect(checkRouterOS("192.168.1.1", "admin", "wrongpass")).rejects.toThrow(
      "Connection refused"
    );
  });

  it("parses uptime with weeks correctly", async () => {
    mockWrite
      .mockResolvedValueOnce([{
        "uptime":       "2w1d",
        "cpu-load":     "10",
        "total-memory": "100",
        "free-memory":  "50",
      }])
      .mockResolvedValueOnce([]);

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    // 2 weeks + 1 day = 2×604800 + 86400 = 1296000
    expect(result.uptime).toBe(1296000);
  });

  it("returns memoryUsed=null when total memory is 0", async () => {
    mockWrite
      .mockResolvedValueOnce([{
        "uptime":       "1h",
        "cpu-load":     "20",
        "total-memory": "0",
        "free-memory":  "0",
      }])
      .mockResolvedValueOnce([]);

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(result.memoryUsed).toBeNull();
  });

  it("closes the connection after a successful read", async () => {
    mockWrite
      .mockResolvedValueOnce([{
        "uptime":       "1h",
        "cpu-load":     "5",
        "total-memory": "100",
        "free-memory":  "80",
      }])
      .mockResolvedValueOnce([]);

    await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(mockClose).toHaveBeenCalled();
  });

  it("captures errors and stays resolved when reads throw (resource + DHCP), still closing", async () => {
    mockWrite.mockRejectedValue(new Error("API error"));

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    // A failed /system/resource no longer kills the whole check — online status
    // and DHCP are independent; the reason is recorded instead.
    expect(result.resourceError).toContain("API error");
    expect(result.dhcpError).toContain("API error");
    expect(result.uptime).toBeNull();
    expect(mockClose).toHaveBeenCalled();
  });

  it("records resourceError when /system/resource returns empty (e.g. missing read policy)", async () => {
    mockWrite
      .mockResolvedValueOnce([])          // /system/resource/print → empty (attempt 1)
      .mockResolvedValueOnce([])          // retry → still empty (attempt 2)
      .mockResolvedValueOnce([            // dhcp leases still work
        { "address": "10.0.0.5", "mac-address": "AA:BB", status: "bound" },
      ]);

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(result.uptime).toBeNull();
    expect(result.cpuLoad).toBeNull();
    expect(result.resourceError).toMatch(/vazia|policy/i);
    expect(result.clients).toHaveLength(1);
  });

  it("retries /system/resource once and succeeds when the first response is empty", async () => {
    mockWrite
      .mockResolvedValueOnce([])                              // resource attempt 1 → empty
      .mockResolvedValueOnce([{ "uptime": "1h", "cpu-load": "7", "total-memory": "100", "free-memory": "60" }]) // retry → ok
      .mockResolvedValueOnce([]);                             // dhcp

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(result.resourceError).toBeNull();
    expect(result.cpuLoad).toBe(7);
    expect(result.uptime).toBe(3600);
  });

  it("rejects (and closes) when the connection itself fails", async () => {
    mockConnect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(checkRouterOS("192.168.1.1", "admin", "pass")).rejects.toThrow("ECONNREFUSED");
    expect(mockClose).toHaveBeenCalled();
  });
});
