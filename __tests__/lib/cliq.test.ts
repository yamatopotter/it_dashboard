/**
 * @jest-environment node
 */
import {
  validateCliqUrl, buildAlertMessage, buildAlertText, buildCliqPayload, sendCliq,
  CliqError, formatDuration, CLIQ_TIMEOUT_MS,
} from "@/lib/cliq";

const OK_URL = "https://cliq.zoho.com/api/v2/bots/watchit/incoming?zapikey=abc";

describe("validateCliqUrl", () => {
  it.each([
    OK_URL,
    "https://cliq.zoho.eu/api/v2/bots/x/incoming?zapikey=1",
    "https://cliq.zoho.in/api/x",
    "https://cliq.zoho.com.au/api/x",
    "https://cliq.zoho.jp/api/x",
    "https://foo.zoho.com.cn/api/x",
  ])("aceita %s", (u) => expect(validateCliqUrl(u)).toBeNull());

  it.each([
    "http://cliq.zoho.com/api",
    "https://localhost/api",
    "https://127.0.0.1/api",
    "https://169.254.169.254/latest",
    "https://evil.com/zoho.com",
    "https://zoho.com.evil.com/x",
    "https://notzoho.com/x",
    "https://user:pw@cliq.zoho.com/x",
    "https://cliq.zoho.com:8443/x",
    "not a url",
    "",
  ])("rejeita %s", (u) => expect(validateCliqUrl(u)).not.toBeNull());
});

describe("formatação", () => {
  const now = new Date("2026-11-03T17:40:00Z");
  const since = new Date("2026-11-03T17:17:00Z"); // 14:17 em São Paulo

  it("formatDuration", () => {
    expect(formatDuration(23)).toBe("23 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(135)).toBe("2 h 15 min");
  });

  it("OPEN de link com afetados", () => {
    const t = buildAlertText({ kind: "OPEN", entityType: "link", id: "l1", name: "Link Vivo 500M", site: "ITA", since, affected: 7 }, now);
    expect(t).toBe("✖ **Itaguaí · Link Vivo 500M** fora — desde 14:17 · 7 equipamentos afetados");
  });

  it("OPEN sem afetados e singular", () => {
    const base = { kind: "OPEN" as const, entityType: "device" as const, id: "d", name: "SW1", since };
    expect(buildAlertText(base, now)).toBe("✖ **SW1** fora — desde 14:17");
    expect(buildAlertText({ ...base, affected: 1 }, now)).toContain("1 equipamento afetado");
  });

  it("RENOTIFY", () => {
    const t = buildAlertText({ kind: "RENOTIFY", entityType: "link", id: "l", name: "L", site: "BAR", since }, now);
    expect(t).toContain("continua fora há 23 min");
    expect(t).toContain("Barra");
  });

  it("RECOVER com ack", () => {
    const t = buildAlertText({ kind: "RECOVER", entityType: "link", id: "l", name: "Link Vivo 500M", site: "ITA", since, ackBy: "fulano", ackNote: "chamado aberto" }, now);
    expect(t).toBe("● **Itaguaí · Link Vivo 500M** voltou — ficou 23 min fora · Ack: fulano, chamado aberto");
  });

  it("FLAPPING e WORKER_STALE", () => {
    expect(buildAlertText({ kind: "FLAPPING", entityType: "device", id: "d", name: "AP1", count: 5 })).toContain("caiu 5× em 15 min");
    expect(buildAlertText({ kind: "WORKER_STALE", minutes: 12 })).toContain("sem dados há 12 min");
  });

  it("botão só existe com APP_URL", () => {
    const ev = { kind: "OPEN" as const, entityType: "link" as const, id: "l9", name: "L", since };
    expect(buildAlertMessage(ev, null, now).buttons).toBeUndefined();
    expect(buildAlertMessage(ev, "https://watch.local/", now).buttons).toEqual([
      { label: "Abrir no WatchIT", url: "https://watch.local/links/l9" },
    ]);
    expect(buildAlertMessage({ kind: "WORKER_STALE", minutes: 5 }, "https://w", now).buttons?.[0].url).toBe("https://w/system");
  });

  it("payload no formato Cliq", () => {
    const p = buildCliqPayload({ text: "oi", buttons: [{ label: "Abrir", url: "https://w/x" }] });
    expect(p).toEqual({
      text: "oi",
      buttons: [{ label: "Abrir", type: "+", action: { type: "open.url", data: { web: "https://w/x" } } }],
    });
    expect(buildCliqPayload({ text: "oi" })).toEqual({ text: "oi" });
  });
});

describe("sendCliq", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("faz POST JSON e resolve em 2xx", async () => {
    const f = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = f as unknown as typeof fetch;
    await sendCliq(OK_URL, "olá");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(OK_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ text: "olá" });
    expect(init.signal).toBeDefined();
    expect(CLIQ_TIMEOUT_MS).toBe(10_000);
  });

  it("rejeita URL inválida sem chamar fetch", async () => {
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    await expect(sendCliq("https://evil.com/x", "a")).rejects.toMatchObject({ code: "INVALID_URL" });
    expect(f).not.toHaveBeenCalled();
  });

  it("erro HTTP", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 }) as unknown as typeof fetch;
    const err = await sendCliq(OK_URL, "a").catch((e) => e);
    expect(err).toBeInstanceOf(CliqError);
    expect(err).toMatchObject({ code: "HTTP", status: 400 });
  });

  it("timeout", async () => {
    const e = new Error("t"); e.name = "TimeoutError";
    global.fetch = jest.fn().mockRejectedValue(e) as unknown as typeof fetch;
    await expect(sendCliq(OK_URL, "a")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("erro de rede", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
    await expect(sendCliq(OK_URL, "a")).rejects.toMatchObject({ code: "NETWORK" });
  });
});
