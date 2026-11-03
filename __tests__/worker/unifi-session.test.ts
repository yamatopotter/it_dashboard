/**
 * @jest-environment node
 */

jest.mock("https", () => ({ request: jest.fn() }));

import * as https from "https";
import { checkUnifi, resetUnifiInformCache, resetUnifiApiKeyCache } from "@/worker/monitors/unifi";

const mockRequest = https.request as jest.Mock;

function fakeRes(statusCode: number, body: unknown, cookies: string[] = []) {
  const raw = JSON.stringify(body);
  const l: Record<string, ((...a: unknown[]) => void)[]> = {};
  const res = {
    statusCode, headers: { "set-cookie": cookies },
    on(ev: string, cb: (...a: unknown[]) => void) { (l[ev] ??= []).push(cb); return res; },
    _flush() { (l["data"] ?? []).forEach((cb) => cb(raw)); (l["end"] ?? []).forEach((cb) => cb()); },
  };
  return res;
}

const calls: string[] = [];
let sessionExpired = false;
let loginCount = 0;

const aps = Array.from({ length: 5 }, (_, i) => ({
  mac: `aa:bb:cc:dd:ee:0${i}`, ip: `192.168.1.${10 + i}`, model: "U6", tx_bytes: 1000, rx_bytes: 1000,
}));

let timeoutSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetUnifiInformCache();
  resetUnifiApiKeyCache();
  calls.length = 0;
  loginCount = 0;
  sessionExpired = false;
  mockRequest.mockImplementation((opts: { path: string; method: string }, cb: (r: ReturnType<typeof fakeRes>) => void) => {
    calls.push(`${opts.method} ${opts.path}`);
    let res: ReturnType<typeof fakeRes>;
    if (opts.method === "POST") {
      loginCount++;
      sessionExpired = false;
      res = fakeRes(200, { csrf: "c" }, [`TOKEN=t${loginCount}; Path=/`]);
    } else if (sessionExpired) {
      res = fakeRes(401, {});
    } else if (opts.path.includes("/stat/device")) {
      res = fakeRes(200, { data: aps });
    } else {
      res = fakeRes(200, { data: [] });
    }
    setImmediate(() => { cb(res); res._flush(); });
    return { on: jest.fn().mockReturnThis(), setTimeout: jest.fn().mockReturnThis(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };
  });
  // Skip the 1 s uplink sampling delay (only setTimeout calls with fn are used by the code under test)
  timeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
    Promise.resolve().then(fn);
    return 0;
  }) as never);
});
afterEach(() => timeoutSpy.mockRestore());

const auth = { method: "userpass" as const, username: "admin", password: "secret" };
const run = (ip: string, a = auth) => checkUnifi(ip, "192.168.1.200", a, 443, "default", false, 30);

describe("UniFi session reuse (Inform)", () => {
  it("5 APs -> 1 login, 1 shared stat/sta and 1 shared stat/device (+1 first-sample read per AP)", async () => {
    await Promise.all(aps.map((a) => run(a.ip)));
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    expect(calls.filter((c) => c.includes("/stat/sta"))).toHaveLength(1);
    expect(calls.filter((c) => c.includes("/stat/device"))).toHaveLength(6);
  });

  it("second cycle reuses the session and the previous sample (no sleep + second read)", async () => {
    await run(aps[0].ip);
    const loginsAfterFirst = loginCount;
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(Date.now() + 30_000);
    const before = calls.length;
    await run(aps[0].ip);
    now.mockRestore();
    expect(loginCount).toBe(loginsAfterFirst);
    expect(calls.length - before).toBe(2); // snapshot refetch only: stat/device + stat/sta
  });

  it("logs in again once when the controller answers 401", async () => {
    await run(aps[0].ip);
    expect(loginCount).toBe(1);
    sessionExpired = true;
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(Date.now() + 60_000); // snapshot expired
    await run(aps[0].ip);
    now.mockRestore();
    expect(loginCount).toBe(2);
  });

  it("a changed password uses a separate session", async () => {
    await run(aps[0].ip);
    await run(aps[0].ip, { ...auth, password: "changed" });
    expect(loginCount).toBe(2);
  });
});

describe("UniFi API key reuse", () => {
  it("5 APs -> 1 discover, 1 sites, shared devices/clients/broadcasts, 1 stats per AP", async () => {
    mockRequest.mockImplementation((opts: { path: string }, cb: (r: ReturnType<typeof fakeRes>) => void) => {
      calls.push(`GET ${opts.path}`);
      const p = opts.path;
      let res;
      if (p.includes("/statistics/latest")) res = fakeRes(200, { uptimeSec: 1 });
      else if (p.includes("/devices")) res = fakeRes(200, { data: aps.map((a, i) => ({ id: `d${i}`, macAddress: a.mac, ipAddress: a.ip })) });
      else if (p.endsWith("/sites") || p.includes("/sites?")) res = fakeRes(200, { data: [{ id: "s1", name: "default" }] });
      else res = fakeRes(200, { data: [] });
      setImmediate(() => { cb(res); res._flush(); });
      return { on: jest.fn().mockReturnThis(), setTimeout: jest.fn().mockReturnThis(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };
    });
    const key = { method: "apikey" as const, apiKey: "k" };
    await Promise.all(aps.map((a) => checkUnifi(a.ip, "192.168.1.200", key, 443, "default", false, 30)));
    // discover(1) + sites(1) + devices/clients/broadcasts(3) + stats(5) = 10 instead of 30
    expect(calls).toHaveLength(10);
  });
});
