import { computeProblems, analyzeProblems, type ProblemDeviceInput, type ProblemLinkInput } from "@/lib/problems";

const NOW = new Date("2026-11-03T12:00:00Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000);
const future = new Date(NOW.getTime() + 3_600_000);

function link(o: Partial<ProblemLinkInput> = {}): ProblemLinkInput {
  return { id: "l1", name: "Link 1", site: "BAR", isOnline: true, usagePct: 10, downSince: null,
    maintenanceUntil: null, ackAt: null, ackBy: null, ackNote: null, ...o };
}
function dev(o: Partial<ProblemDeviceInput> = {}): ProblemDeviceInput {
  return { id: "d1", name: "Dev 1", kind: "DISP", type: "OTHER", site: "BAR", isOnline: false,
    consecutiveFailures: 3, alertThreshold: 3, offlineSince: ago(600), maintenanceUntil: null,
    ackAt: null, ackBy: null, ackNote: null, ...o };
}
const run = (links: ProblemLinkInput[], devices: ProblemDeviceInput[]) => computeProblems({ links, devices, now: NOW });

describe("computeProblems", () => {
  it.each([
    [2, 3, 0],
    [3, 3, 1],
    [5, 3, 1],
    [1, 1, 1],
  ])("threshold: %i falhas, limiar %i => %i problema(s)", (fails, thr, n) => {
    expect(run([], [dev({ consecutiveFailures: fails, alertThreshold: thr })])).toHaveLength(n);
  });

  it("dispositivo online ou sem status não gera problema", () => {
    expect(run([], [dev({ isOnline: true }), dev({ id: "d2", isOnline: null })])).toHaveLength(0);
  });

  it("link DOWN é crit; com ack vira severity ack", () => {
    const [p] = run([link({ isOnline: false, downSince: ago(120) })], []);
    expect(p).toMatchObject({ id: "LINK:l1", severity: "crit", what: "DOWN", sinceSec: 120, acknowledged: false });
    const [a] = run([link({ isOnline: false, downSince: ago(120), ackAt: ago(10), ackBy: "ana", ackNote: "operadora" })], []);
    expect(a).toMatchObject({ severity: "ack", acknowledged: true, ackBy: "ana", ackNote: "operadora" });
  });

  it("dispositivo com ack vira ack", () => {
    const [p] = run([], [dev({ ackAt: ago(5), ackBy: "bob" })]);
    expect(p.severity).toBe("ack");
    expect(p.ackBy).toBe("bob");
  });

  it("manutenção no futuro some; vencida volta", () => {
    expect(run([link({ isOnline: false, maintenanceUntil: future })], [dev({ maintenanceUntil: future })])).toHaveLength(0);
    expect(run([], [dev({ maintenanceUntil: ago(10) })])).toHaveLength(1);
    const a = analyzeProblems({ links: [], devices: [dev({ maintenanceUntil: future })], now: NOW });
    expect(a.devices.get("d1")?.state).toBe("maint");
  });

  it("link com uso 93% é warn; 89% não", () => {
    const [p] = run([link({ usagePct: 93 })], []);
    expect(p).toMatchObject({ severity: "warn", what: "uso 93%" });
    expect(run([link({ usagePct: 89 })], [])).toHaveLength(0);
  });

  it("AP offline é warn; Mikrotik offline é crit", () => {
    const ps = run([], [dev({ id: "ap", kind: "AP", type: "UNIFI_AP", site: "BOT" }), dev({ id: "mk", type: "MIKROTIK" })]);
    expect(ps.find((p) => p.entityId === "ap")?.severity).toBe("warn");
    expect(ps.find((p) => p.entityId === "mk")?.severity).toBe("crit");
  });

  it("agrupa por unidade sob link DOWN e marca sup", () => {
    const a = analyzeProblems({
      links: [link({ isOnline: false, downSince: ago(300) })],
      devices: [dev({ id: "a" }), dev({ id: "ap", kind: "AP", type: "UNIFI_AP" }), dev({ id: "o", site: "BOT" })],
      now: NOW,
    });
    const link1 = a.problems.find((p) => p.id === "LINK:l1")!;
    expect(link1.children.map((c) => c.id).sort()).toEqual(["a", "ap"]);
    expect(a.devices.get("a")).toMatchObject({ state: "sup", suppressedByLinkId: "l1" });
    expect(a.problems.map((p) => p.entityId)).toEqual(["l1", "o"]);
  });

  it("gateway Mikrotik offline agrupa os demais da unidade", () => {
    const a = analyzeProblems({
      links: [],
      devices: [dev({ id: "gw", type: "MIKROTIK" }), dev({ id: "sw" }), dev({ id: "ap", kind: "AP", type: "OMADA_AP" })],
      now: NOW,
    });
    expect(a.problems).toHaveLength(1);
    expect(a.problems[0].entityId).toBe("gw");
    expect(a.problems[0].children).toHaveLength(2);
    expect(a.devices.get("sw")?.state).toBe("sup");
    expect(a.devices.get("gw")?.state).toBe("crit");
  });

  it("site null não é agrupado", () => {
    const ps = run([link({ isOnline: false, site: null, downSince: ago(60) })], [dev({ site: null })]);
    expect(ps).toHaveLength(2);
    expect(ps.every((p) => p.children.length === 0)).toBe(true);
  });

  it("link em manutenção não suprime filhos", () => {
    const ps = run([link({ isOnline: false, maintenanceUntil: future })], [dev()]);
    expect(ps.map((p) => p.entityId)).toEqual(["d1"]);
  });

  it("ordena crit > warn > ack e mais antigo primeiro", () => {
    const ps = run(
      [link({ id: "u", usagePct: 95 }), link({ id: "dn", site: null, isOnline: false, downSince: ago(100) }),
       link({ id: "ak", site: null, isOnline: false, downSince: ago(9000), ackAt: ago(1) })],
      [dev({ id: "old", site: null, type: "MIKROTIK", offlineSince: ago(500) }), dev({ id: "w", site: null, offlineSince: ago(900) })],
    );
    expect(ps.map((p) => p.entityId)).toEqual(["old", "dn", "w", "u", "ak"]);
  });
});
