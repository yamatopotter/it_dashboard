import { fmtAge, fmtMbps, pctLevel, GLYPH, SEVERITY_ORDER } from "@/lib/tui-format";

describe("fmtAge", () => {
  it.each([
    [0, "0m00s"],
    [862, "14m22s"],
    [3599, "59m59s"],
    [6000, "1h40m"],
    [90000, "1d 1h"],
    [277200, "3d 5h"],
  ])("%i s -> %s", (s, out) => expect(fmtAge(s)).toBe(out));

  it("trata nulo, negativo e NaN", () => {
    expect(fmtAge(null)).toBe("—");
    expect(fmtAge(Number.NaN)).toBe("—");
    expect(fmtAge(-5)).toBe("0m00s");
  });
});

describe("pctLevel", () => {
  it("usa limites 70 e 90", () => {
    expect(pctLevel(69)).toBe("ok");
    expect(pctLevel(70)).toBe("warn");
    expect(pctLevel(89)).toBe("warn");
    expect(pctLevel(90)).toBe("crit");
    expect(pctLevel(null)).toBe("ok");
  });
});

describe("glifos e ordem", () => {
  it("estado nunca é só cor", () => {
    expect(GLYPH.ok).toBe("●");
    expect(GLYPH.warn).toBe("▲");
    expect(GLYPH.crit).toBe("✖");
    expect(GLYPH.ack).toBe("░");
    expect(GLYPH.sup).toBe("◌");
  });
  it("crit vem antes de warn e ack por último", () => {
    expect(SEVERITY_ORDER.crit).toBeLessThan(SEVERITY_ORDER.warn);
    expect(SEVERITY_ORDER.warn).toBeLessThan(SEVERITY_ORDER.ack);
  });
  it("fmtMbps", () => {
    expect(fmtMbps(300_000_000)).toBe("300M");
    expect(fmtMbps(2_500_000)).toBe("2.5M");
    expect(fmtMbps(null)).toBe("—");
  });
});
