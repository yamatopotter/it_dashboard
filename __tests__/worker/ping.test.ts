/**
 * @jest-environment node
 */
import { checkPing } from "@/worker/monitors/ping";

jest.mock("ping", () => ({
  promise: {
    probe: jest.fn(),
  },
}));

import ping from "ping";
const mockProbe = (ping.promise.probe as jest.Mock);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("checkPing", () => {
  it("returns alive=true and responseMs when host responds", async () => {
    mockProbe.mockResolvedValue({ alive: true, time: 42, host: "192.168.1.1" });

    const result = await checkPing("192.168.1.1");

    expect(result.alive).toBe(true);
    expect(result.responseMs).toBe(42);
  });

  it("returns alive=false and responseMs=null when host is unreachable", async () => {
    mockProbe.mockResolvedValue({ alive: false, time: "unknown", host: "192.168.1.99" });

    const result = await checkPing("192.168.1.99");

    expect(result.alive).toBe(false);
    expect(result.responseMs).toBeNull();
  });

  it("returns responseMs=null when time is 'unknown' even if alive", async () => {
    mockProbe.mockResolvedValue({ alive: true, time: "unknown", host: "192.168.1.1" });

    const result = await checkPing("192.168.1.1");

    expect(result.alive).toBe(true);
    expect(result.responseMs).toBeNull();
  });

  it("returns alive=false on probe error", async () => {
    mockProbe.mockRejectedValue(new Error("EHOSTUNREACH"));

    const result = await checkPing("192.168.1.1");

    expect(result.alive).toBe(false);
    expect(result.responseMs).toBeNull();
  });

  it("rounds fractional response time", async () => {
    mockProbe.mockResolvedValue({ alive: true, time: 12.7, host: "192.168.1.1" });

    const result = await checkPing("192.168.1.1");

    expect(result.responseMs).toBe(13);
  });
});
