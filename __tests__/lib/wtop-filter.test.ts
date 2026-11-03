import { fuzzyScore, matchesFilter, parseFilter, sortDevices } from "@/lib/wtop-filter";
import type { TowerDevice } from "@/lib/tower-types";

const d = (p: Partial<TowerDevice>): TowerDevice => ({
  id: p.name ?? "x", name: "X", ip: "10.0.0.1", type: "OTHER", site: "ITA", state: "ok", isOnline: true, responseMs: 1, cpuPct: null,
  offlineForSec: null, consecutiveFailures: 0, acknowledged: false, ackBy: null, ackNote: null, maintenanceUntil: null,
  suppressedByLinkId: null, spark: [], ...p,
});

describe("parseFilter", () => {
  it.each([
    ["sede:ita tipo:switch off", { site: "ITA", types: ["switch"], off: true, text: [], unknown: [] }],
    ["SEDE:Itaguaí", { site: "ITA", types: null, off: false, text: [], unknown: [] }],
    ["site:barra", { site: "BAR", types: null, off: false, text: [], unknown: [] }],
    ["nvr 192.168 estoq", { site: null, types: null, off: false, text: ["nvr", "192.168", "estoq"], unknown: [] }],
    ["tipo:ap", { site: null, types: ["omada_ap", "unifi_ap"], off: false, text: [], unknown: [] }],
    ["sede:xyz", { site: null, types: null, off: false, text: [], unknown: ["sede:xyz"] }],
    ["cor:azul sw", { site: null, types: null, off: false, text: ["sw"], unknown: ["cor:azul"] }],
    ["tipo:", { site: null, types: null, off: false, text: [], unknown: ["tipo:"] }],
    ["   ", { site: null, types: null, off: false, text: [], unknown: [] }],
  ])("%j", (q, exp) => {
    expect(parseFilter(q)).toEqual(exp);
  });
});

describe("matchesFilter", () => {
  const sw = d({ name: "SW-ITA-CORE", ip: "192.168.0.2" });
  const sw2 = d({ name: "SW-BOT-1", site: "BOT", state: "crit" });
  const mk = d({ name: "RB5009", type: "MIKROTIK", ip: "192.168.0.1" });
  it("combina termos", () => {
    const f = parseFilter("sede:ita tipo:switch");
    expect([sw, sw2, mk].filter((x) => matchesFilter(x, f))).toEqual([sw]);
  });
  it("off exclui online", () => {
    expect(matchesFilter(sw, parseFilter("off"))).toBe(false);
    expect(matchesFilter(sw2, parseFilter("off"))).toBe(true);
  });
  it("texto livre casa nome ou ip, todos os termos", () => {
    expect(matchesFilter(mk, parseFilter("rb50 .0.1"))).toBe(true);
    expect(matchesFilter(mk, parseFilter("rb50 zzz"))).toBe(false);
  });
  it("sede inválida é ignorada (não filtra)", () => {
    expect(matchesFilter(sw2, parseFilter("sede:xyz"))).toBe(true);
  });
});

describe("sortDevices", () => {
  const a = d({ name: "B", ip: "10.0.0.10", responseMs: 5, state: "ok" });
  const b = d({ name: "A", ip: "10.0.0.9", responseMs: null, state: "crit" });
  const c = d({ name: "C", ip: "10.0.0.2", responseMs: 1, state: "sup" });
  const names = (l: TowerDevice[]) => l.map((x) => x.name).join("");
  it("por estado: crit, sup, ok", () => expect(names(sortDevices([a, b, c], { key: "st", dir: 1 }))).toBe("ACB"));
  it("por ip numérico", () => expect(names(sortDevices([a, b, c], { key: "ip", dir: 1 }))).toBe("CAB"));
  it("por ping, nulo por último; descendente inverte", () => {
    expect(names(sortDevices([a, b, c], { key: "ping", dir: 1 }))).toBe("CBA");
    expect(names(sortDevices([a, b, c], { key: "ping", dir: -1 }))).toBe("ABC");
  });
  it("não muta a entrada", () => {
    const l = [a, b, c];
    sortDevices(l, { key: "name", dir: 1 });
    expect(names(l)).toBe("BAC");
  });
});

describe("fuzzyScore", () => {
  it("subsequência casa, ausente não", () => {
    expect(fuzzyScore("nvr", "NVR-02 10.0.0.42")).toBeGreaterThanOrEqual(0);
    expect(fuzzyScore("zzz", "NVR-02")).toBe(-1);
    expect(fuzzyScore("", "qualquer")).toBe(0);
  });
  it("prefixo vence subsequência dispersa", () => {
    expect(fuzzyScore("rel", "relatórios")).toBeLessThan(fuzzyScore("rel", "ir para o relógio"));
  });
});
