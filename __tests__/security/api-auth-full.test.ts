/**
 * @jest-environment node
 *
 * Comprehensive authentication enforcement tests.
 * Every protected route must return 401 without a valid session.
 */
import { GET as linksGET, POST as linksPOST } from "@/app/api/links/route";
import {
  GET as linkIdGET,
  PUT as linkIdPUT,
  DELETE as linkIdDELETE,
} from "@/app/api/links/[id]/route";
import { GET as overviewGET } from "@/app/api/overview/route";
import { GET as incidentsGET } from "@/app/api/incidents/route";
import { GET as timelineGET } from "@/app/api/timeline/route";
import { GET as healthGET } from "@/app/api/health/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/db", () => ({
  db: {
    link: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    statusHistory: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    deviceStatus: { findMany: jest.fn() },
    device: { findMany: jest.fn() },
    workerHeartbeat: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

const FAKE_LINK_PARAMS = Promise.resolve({ id: "link-1" });

describe("Links routes — 401 without session", () => {
  it("GET /api/links → 401", async () => {
    const res = await linksGET(new NextRequest("http://localhost/api/links"));
    expect(res.status).toBe(401);
  });

  it("POST /api/links → 401", async () => {
    const req = new NextRequest("http://localhost/api/links", {
      method: "POST",
      body: JSON.stringify({ name: "Link", location: "SP" }),
    });
    const res = await linksPOST(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/links/:id → 401", async () => {
    const req = new NextRequest("http://localhost/api/links/link-1");
    const res = await linkIdGET(req, { params: FAKE_LINK_PARAMS });
    expect(res.status).toBe(401);
  });

  it("PUT /api/links/:id → 401", async () => {
    const req = new NextRequest("http://localhost/api/links/link-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await linkIdPUT(req, { params: FAKE_LINK_PARAMS });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/links/:id → 401", async () => {
    const req = new NextRequest("http://localhost/api/links/link-1", { method: "DELETE" });
    const res = await linkIdDELETE(req, { params: FAKE_LINK_PARAMS });
    expect(res.status).toBe(401);
  });
});

describe("Aggregation routes — 401 without session", () => {
  it("GET /api/overview → 401", async () => {
    const res = await overviewGET(new NextRequest("http://localhost/api/overview"));
    expect(res.status).toBe(401);
  });

  it("GET /api/incidents → 401", async () => {
    const res = await incidentsGET(new NextRequest("http://localhost/api/incidents"));
    expect(res.status).toBe(401);
  });

  it("GET /api/timeline → 401", async () => {
    const res = await timelineGET(new NextRequest("http://localhost/api/timeline"));
    expect(res.status).toBe(401);
  });
});

describe("Health route — 401 without session (SEC-024)", () => {
  it("GET /api/health → 401 (requires auth)", async () => {
    // Health exposes operational metrics — must be protected
    const res = await healthGET();
    expect(res.status).toBe(401);
  });
});
