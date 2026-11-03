/**
 * @jest-environment node
 */

jest.mock("https", () => ({ request: jest.fn() }));
jest.mock("http",  () => ({ request: jest.fn() }));

import * as https from "https";
import { checkOmada, resetOmadaCache } from "@/worker/monitors/omada";

const mockRequest = https.request as jest.Mock;

function fakeRes(statusCode: number, body: unknown) {
  const raw = JSON.stringify(body);
  const l: Record<string, ((...a: unknown[]) => void)[]> = {};
  const res = {
    statusCode, headers: {},
    on(ev: string, cb: (...a: unknown[]) => void) { (l[ev] ??= []).push(cb); return res; },
    _flush() { (l["data"] ?? []).forEach((cb) => cb(raw)); (l["end"] ?? []).forEach((cb) => cb()); },
  };
  return res;
}

const paths: string[] = [];
let tokenCounter = 0;
let expiredTokens: Set<string>;

const aps = Array.from({ length: 11 }, (_, i) => ({
  mac: `AA:00:00:00:00:${String(i).padStart(2, "0")}`, ip: `192.168.10.${20 + i}`, model: "EAP225", cpuUtil: 5, memUtil: 10,
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetOmadaCache();
  paths.length = 0;
  tokenCounter = 0;
  expiredTokens = new Set();
  mockRequest.mockImplementation((
    opts: { path: string; headers: Record<string, string> },
    cb: (r: ReturnType<typeof fakeRes>) => void,
  ) => {
    paths.push(opts.path);
    let res: ReturnType<typeof fakeRes>;
    if (opts.path.includes("/authorize/token")) {
      res = fakeRes(200, { errorCode: 0, result: { accessToken: `tok-${++tokenCounter}`, expiresIn: 7200, refreshToken: "r" } });
    } else if (expiredTokens.has((opts.headers.Authorization ?? "").replace("AccessToken=", ""))) {
      res = fakeRes(200, { errorCode: -44112 });
    } else if (opts.path.includes("/devices")) {
      res = fakeRes(200, { errorCode: 0, result: { data: aps } });
    } else {
      res = fakeRes(200, { errorCode: 0, result: { data: [] } });
    }
    setImmediate(() => { cb(res); res._flush(); });
    return { on: jest.fn().mockReturnThis(), setTimeout: jest.fn().mockReturnThis(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };
  });
});

const run = (ip: string, secret = "csecret") =>
  checkOmada(ip, "10.0.0.19", "omc", "cid", secret, "site1", false, 443, 30);
const tokenCalls = () => paths.filter((p) => p.includes("/authorize/token")).length;

describe("checkOmada caching", () => {
  it("11 APs of the same site in one cycle -> 1 token + 1 devices + 1 clients request", async () => {
    const results = await Promise.all(aps.map((a) => run(a.ip)));
    expect(results).toHaveLength(11);
    expect(tokenCalls()).toBe(1);
    expect(paths.filter((p) => p.includes("/devices"))).toHaveLength(1);
    expect(paths.filter((p) => p.includes("/clients"))).toHaveLength(1);
  });

  it("serves sequential calls inside the TTL window from the snapshot", async () => {
    await run(aps[0].ip);
    await run(aps[1].ip);
    expect(paths).toHaveLength(3);
  });

  it("reuses the token across snapshot refreshes and renews it after expiry", async () => {
    const now = jest.spyOn(Date, "now");
    const t0 = 1_700_000_000_000;
    now.mockReturnValue(t0);
    await run(aps[0].ip);
    now.mockReturnValue(t0 + 20_000); // snapshot stale (TTL <= 15 s), token still valid
    await run(aps[0].ip);
    expect(tokenCalls()).toBe(1);
    expect(paths.filter((p) => p.includes("/devices"))).toHaveLength(2);

    now.mockReturnValue(t0 + 8_000_000); // beyond expiresIn (7200 s)
    await run(aps[0].ip);
    expect(tokenCalls()).toBe(2);
    now.mockRestore();
  });

  it("refreshes the token once when the controller reports it expired", async () => {
    expiredTokens.add("tok-1");
    const r = await run(aps[0].ip);
    expect(r.model).toBe("EAP225");
    expect(tokenCalls()).toBe(2);
  });

  it("does not share cache across different credentials", async () => {
    await run(aps[0].ip);
    await run(aps[0].ip, "other-secret");
    expect(tokenCalls()).toBe(2);
  });
});
