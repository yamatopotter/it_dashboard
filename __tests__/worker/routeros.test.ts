/**
 * @jest-environment node
 */

jest.mock("routeros", () => ({
  __esModule: true,
  default: { RouterOSClient: jest.fn() },
  RouterOSClient: jest.fn(),
}));

import RouterOS from "routeros";
import { checkRouterOS } from "@/worker/monitors/routeros";

// routeros.ts uses: ROS.RouterOSClient ?? ROS.default?.RouterOSClient ?? ROS
// Our mock default export is { RouterOSClient: jest.fn() }, so ClientClass = mock.default.RouterOSClient
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockRouterOSClient = (RouterOS as any).RouterOSClient as jest.Mock;

let mockConnect: jest.Mock;
let mockDisconnect: jest.Mock;
let mockWrite: jest.Mock;
let mockApi: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect = jest.fn().mockResolvedValue(undefined);
  mockDisconnect = jest.fn().mockResolvedValue(undefined);
  mockWrite = jest.fn();
  mockApi = jest.fn().mockReturnValue({ write: mockWrite });

  MockRouterOSClient.mockImplementation(() => ({
    connect: mockConnect,
    api: mockApi,
    disconnect: mockDisconnect,
  }));
});

describe("checkRouterOS", () => {
  it("returns uptime, cpuLoad, and memoryUsed from resource data", async () => {
    mockWrite.mockResolvedValue([{
      "uptime": "1d2h3m4s",
      "cpu-load": "45",
      "total-memory": "134217728",
      "free-memory": "67108864",
    }]);

    const result = await checkRouterOS("192.168.1.1", "admin", "password");

    // 1d2h3m4s = 86400 + 7200 + 180 + 4 = 93784
    expect(result.uptime).toBe(93784);
    expect(result.cpuLoad).toBe(45);
    expect(result.memoryUsed).toBeCloseTo(50); // (128MB - 64MB) / 128MB * 100
  });

  it("returns nulls when connection fails", async () => {
    mockConnect.mockRejectedValue(new Error("Connection refused"));

    const result = await checkRouterOS("192.168.1.1", "admin", "wrongpass");

    expect(result.uptime).toBeNull();
    expect(result.cpuLoad).toBeNull();
    expect(result.memoryUsed).toBeNull();
  });

  it("parses uptime with weeks correctly", async () => {
    mockWrite.mockResolvedValue([{
      "uptime": "2w1d",
      "cpu-load": "10",
      "total-memory": "100",
      "free-memory": "50",
    }]);

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    // 2 weeks + 1 day = 2*604800 + 86400 = 1296000
    expect(result.uptime).toBe(1296000);
  });

  it("returns memoryUsed=null when total memory is 0", async () => {
    mockWrite.mockResolvedValue([{
      "uptime": "1h",
      "cpu-load": "20",
      "total-memory": "0",
      "free-memory": "0",
    }]);

    const result = await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(result.memoryUsed).toBeNull();
  });

  it("disconnects client after successful read", async () => {
    mockWrite.mockResolvedValue([{
      "uptime": "1h",
      "cpu-load": "5",
      "total-memory": "100",
      "free-memory": "80",
    }]);

    await checkRouterOS("192.168.1.1", "admin", "pass");

    expect(mockDisconnect).toHaveBeenCalled();
  });
});
