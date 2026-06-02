/**
 * @jest-environment node
 */
import { checkHttp } from "@/worker/monitors/http";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("checkHttp", () => {
  it("returns ok=true for 200 response", async () => {
    mockFetch.mockResolvedValue({ status: 200 });

    const result = await checkHttp("192.168.1.1", 80, "/");

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("returns ok=true for 404 response (< 500)", async () => {
    mockFetch.mockResolvedValue({ status: 404 });

    const result = await checkHttp("192.168.1.1", 8080, "/health");

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(404);
  });

  it("returns ok=false for 500 server error", async () => {
    mockFetch.mockResolvedValue({ status: 500 });

    const result = await checkHttp("192.168.1.1", 80, "/");

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
  });

  it("returns ok=false for 503 response", async () => {
    mockFetch.mockResolvedValue({ status: 503 });

    const result = await checkHttp("192.168.1.1", 80, "/");

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(503);
  });

  it("returns ok=false and statusCode=null on network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await checkHttp("192.168.1.1", 80, "/");

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
  });

  it("returns ok=false when request is aborted (timeout)", async () => {
    mockFetch.mockImplementation(() => {
      const err = new DOMException("The operation was aborted", "AbortError");
      return Promise.reject(err);
    });

    const result = await checkHttp("192.168.1.1", 80, "/");

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
  });

  it("builds the correct URL from ip, port and path", async () => {
    mockFetch.mockResolvedValue({ status: 200 });

    await checkHttp("10.0.0.5", 8888, "/api/health");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://10.0.0.5:8888/api/health",
      expect.objectContaining({ redirect: "follow" })
    );
  });
});
