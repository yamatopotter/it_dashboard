import { inferSite } from "@/lib/site-infer";

describe("inferSite", () => {
  const cases: [string, { location?: string | null; name?: string | null; description?: string | null }, string | null][] = [
    ["barra em location", { location: "Barra" }, "BAR"],
    ["caixa e acento", { location: "BARRA DA TIJUCA" }, "BAR"],
    ["botafogo", { location: "Botafogo" }, "BOT"],
    ["bota abreviado", { name: "SW-BOTA-01" }, "BOT"],
    ["bota dentro de palavra não conta", { name: "Robotarium" }, null],
    ["bota como palavra", { name: "AP Bota 2" }, "BOT"],
    ["itaguaí com acento", { location: "Itaguaí" }, "ITA"],
    ["itagua sem acento", { description: "rack itagua" }, "ITA"],
    ["pista no nome", { location: "Sala TI", name: "Router Botafogo" }, "BOT"],
    ["mesma unidade repetida", { location: "Barra", name: "GW Barra" }, "BAR"],
    ["conflito é ambíguo", { location: "Barra", name: "Link Itaguaí" }, null],
    ["sem match", { location: "Sala de TI" }, null],
    ["tudo vazio/null", { location: null, name: null, description: null }, null],
    ["objeto vazio", {}, null],
  ];
  it.each(cases)("%s", (_n, input, expected) => {
    expect(inferSite(input)).toBe(expected);
  });
});
