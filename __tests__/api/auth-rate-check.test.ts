/**
 * @jest-environment node
 */
import { POST } from "@/app/api/auth/rate-check/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/db", () => ({
  db: {
    rateLimit: {
      findUnique: jest.fn(),
      upsert:     jest.fn(),
      update:     jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";

const mockDb = db as jest.Mocked<typeof db>;

const SECRET = "test-secret-value";

function makeReq(body: object, secret = SECRET) {
  return new NextRequest("http://localhost/api/auth/rate-check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.NEXTAUTH_SECRET;
});

describe("POST /api/auth/rate-check", () => {
  it("returns 403 when Authorization header is missing", async () => {
    const req = new NextRequest("http://localhost/api/auth/rate-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: "1.2.3.4" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when secret is wrong", async () => {
    const res = await POST(makeReq({ ip: "1.2.3.4" }, "wrong-secret"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when ip is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("allows first attempt (new IP)", async () => {
    (mockDb.rateLimit.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.rateLimit.upsert as jest.Mock).mockResolvedValue({ ip: "1.1.1.1", count: 1, resetAt: new Date(Date.now() + 900_000) });

    const res = await POST(makeReq({ ip: "1.1.1.1" }));
    const body = await res.json() as { allowed: boolean; remaining: number };

    expect(res.status).toBe(200);
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(9);
  });

  it("allows attempt when window has expired (resets count)", async () => {
    const expiredResetAt = new Date(Date.now() - 1000); // expired
    (mockDb.rateLimit.findUnique as jest.Mock).mockResolvedValue({ ip: "2.2.2.2", count: 15, resetAt: expiredResetAt });
    (mockDb.rateLimit.upsert as jest.Mock).mockResolvedValue({ ip: "2.2.2.2", count: 1, resetAt: new Date(Date.now() + 900_000) });

    const res = await POST(makeReq({ ip: "2.2.2.2" }));
    const body = await res.json() as { allowed: boolean; remaining: number };

    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(9);
  });

  it("blocks attempt when count exceeds MAX_ATTEMPTS (10)", async () => {
    const futureResetAt = new Date(Date.now() + 900_000);
    (mockDb.rateLimit.findUnique as jest.Mock).mockResolvedValue({ ip: "3.3.3.3", count: 10, resetAt: futureResetAt });
    (mockDb.rateLimit.update as jest.Mock).mockResolvedValue({ ip: "3.3.3.3", count: 11, resetAt: futureResetAt });

    const res = await POST(makeReq({ ip: "3.3.3.3" }));
    const body = await res.json() as { allowed: boolean; remaining: number };

    expect(body.allowed).toBe(false);
    expect(body.remaining).toBe(0);
  });

  it("allows attempt at exactly MAX_ATTEMPTS (10th attempt)", async () => {
    const futureResetAt = new Date(Date.now() + 900_000);
    (mockDb.rateLimit.findUnique as jest.Mock).mockResolvedValue({ ip: "4.4.4.4", count: 9, resetAt: futureResetAt });
    (mockDb.rateLimit.update as jest.Mock).mockResolvedValue({ ip: "4.4.4.4", count: 10, resetAt: futureResetAt });

    const res = await POST(makeReq({ ip: "4.4.4.4" }));
    const body = await res.json() as { allowed: boolean; remaining: number };

    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(0);
  });

  it("increments count on active window", async () => {
    const futureResetAt = new Date(Date.now() + 900_000);
    (mockDb.rateLimit.findUnique as jest.Mock).mockResolvedValue({ ip: "5.5.5.5", count: 3, resetAt: futureResetAt });
    (mockDb.rateLimit.update as jest.Mock).mockResolvedValue({ ip: "5.5.5.5", count: 4, resetAt: futureResetAt });

    await POST(makeReq({ ip: "5.5.5.5" }));

    expect(mockDb.rateLimit.update).toHaveBeenCalledWith({
      where: { ip: "5.5.5.5" },
      data: { count: { increment: 1 } },
    });
  });
});
