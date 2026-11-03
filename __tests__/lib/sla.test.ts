import { linkAvailability, monthRange, monthKeyOf, deviceAvailability, aggregateAvailability } from "@/lib/sla";

// SP = UTC-3. 2026-11-01 00:00 SP = 03:00Z
const nov = monthRange("2026-11")!;
const at = (d: number, h = 0, m = 0) => new Date(Date.UTC(2026, 10, d, h + 3, m));
const ev = (type: "UP" | "DOWN", t: Date) => ({ type, timestamp: t });
const END = new Date("2027-01-01T00:00:00Z");

describe("monthRange", () => {
  it("calcula limites em America/Sao_Paulo", () => {
    expect(nov.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(nov.end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(nov.days).toBe(30);
  });
  it("fevereiro bissexto tem 29 dias", () => {
    expect(monthRange("2028-02")!.days).toBe(29);
    expect(monthRange("2027-02")!.days).toBe(28);
  });
  it("rejeita entrada inválida", () => {
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("abc")).toBeNull();
  });
  it("monthKeyOf respeita o fuso (virada de mês)", () => {
    expect(monthKeyOf(new Date("2026-12-01T02:59:00Z"))).toBe("2026-11");
    expect(monthKeyOf(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12");
  });
});

describe("linkAvailability", () => {
  it("sem eventos e mês fechado = 100% e todos os dias ok", () => {
    const r = linkAvailability([], nov.start, nov.end, END);
    expect(r.availabilityPct).toBe(100);
    expect(r.drops).toBe(0);
    expect(r.perDay).toHaveLength(30);
    expect(r.perDay.every(d => d.state === "ok")).toBe(true);
  });

  it("queda DOWN->UP de 18 min marca dia parcial", () => {
    const r = linkAvailability([ev("DOWN", at(12, 10, 0)), ev("UP", at(12, 10, 18))], nov.start, nov.end, END);
    expect(r.downtimeSec).toBe(18 * 60);
    expect(r.drops).toBe(1);
    expect(r.longestDropSec).toBe(18 * 60);
    expect(r.perDay[11]).toEqual({ day: 12, state: "partial", downtimeSec: 1080 });
    expect(r.availabilityPct).toBeCloseTo(100 - (18 / (30 * 1440)) * 100, 6);
  });

  it("queda atravessando a meia-noite divide entre dois dias", () => {
    const r = linkAvailability([ev("DOWN", at(5, 23, 0)), ev("UP", at(6, 1, 0))], nov.start, nov.end, END);
    expect(r.perDay[4].downtimeSec).toBe(3600);
    expect(r.perDay[5].downtimeSec).toBe(3600);
    expect(r.drops).toBe(1);
  });

  it("dia inteiro fora = down", () => {
    const r = linkAvailability([ev("DOWN", at(3)), ev("UP", at(4))], nov.start, nov.end, END);
    expect(r.perDay[2].state).toBe("down");
  });

  it("queda aberta vai até now e dias futuros são future", () => {
    const now = at(10, 12, 0);
    const r = linkAvailability([ev("DOWN", at(10, 0, 0))], nov.start, nov.end, now);
    expect(r.downtimeSec).toBe(12 * 3600);
    expect(r.perDay[9].state).toBe("down");
    expect(r.perDay[10].state).toBe("future");
    expect(r.perDay[29].state).toBe("future");
    expect(r.availabilityPct).toBeCloseTo(((9.5 * 24 - 12) / (9.5 * 24)) * 100, 6);
  });

  it("DOWN anterior ao mês: queda começa no início do mês até o primeiro UP", () => {
    const r = linkAvailability([ev("UP", at(1, 2, 0))], nov.start, nov.end, END, {
      previousEvent: ev("DOWN", new Date("2026-10-31T20:00:00Z")),
    });
    expect(r.downtimeSec).toBe(2 * 3600);
    expect(r.drops).toBe(0);
  });

  it("UP sem DOWN anterior é ignorado", () => {
    const r = linkAvailability([ev("UP", at(2, 5, 0))], nov.start, nov.end, END, {
      previousEvent: ev("UP", new Date("2026-10-30T00:00:00Z")),
    });
    expect(r.downtimeSec).toBe(0);
    expect(r.availabilityPct).toBe(100);
  });

  it("DOWN duplicado não conta duas quedas", () => {
    const r = linkAvailability(
      [ev("DOWN", at(2, 1)), ev("DOWN", at(2, 2)), ev("UP", at(2, 3))], nov.start, nov.end, END);
    expect(r.drops).toBe(1);
    expect(r.downtimeSec).toBe(2 * 3600);
  });

  it("antes de observedSince é nodata e fica fora do denominador", () => {
    const r = linkAvailability([], nov.start, nov.end, END, { observedSince: at(11, 0, 0) });
    expect(r.perDay[0].state).toBe("nodata");
    expect(r.perDay[9].state).toBe("nodata");
    expect(r.perDay[10].state).toBe("ok");
    expect(r.availabilityPct).toBe(100);
  });

  it("sem nenhuma observação: availabilityPct null (nem 0 nem 100)", () => {
    const r = linkAvailability([], nov.start, nov.end, END, { observedSince: new Date("2027-02-01T00:00:00Z") });
    expect(r.availabilityPct).toBeNull();
    expect(r.perDay.every(d => d.state === "nodata")).toBe(true);
  });

  it("mês futuro: tudo future", () => {
    const r = linkAvailability([], nov.start, nov.end, new Date("2026-10-01T00:00:00Z"));
    expect(r.perDay.every(d => d.state === "future")).toBe(true);
    expect(r.availabilityPct).toBeNull();
  });

  it("virada de mês: queda que continua no mês seguinte é clipada ao mês", () => {
    const r = linkAvailability([ev("DOWN", at(30, 22, 0)), ev("UP", new Date("2026-12-01T05:00:00Z"))], nov.start, nov.end, END);
    expect(r.downtimeSec).toBe(2 * 3600);
  });

  it("fevereiro bissexto gera 29 células", () => {
    const m = monthRange("2028-02")!;
    expect(linkAvailability([], m.start, m.end, new Date("2028-04-01T00:00:00Z")).perDay).toHaveLength(29);
  });
});

describe("deviceAvailability / aggregateAvailability", () => {
  it("proporção de checks online; sem checks = null", () => {
    expect(deviceAvailability(10, 9)).toBe(90);
    expect(deviceAvailability(0, 0)).toBeNull();
  });
  it("agrega ponderando pelo tempo observado", () => {
    expect(aggregateAvailability([{ downtimeSec: 10, observedSec: 100 }, { downtimeSec: 0, observedSec: 100 }])).toBe(95);
    expect(aggregateAvailability([])).toBeNull();
  });
});
