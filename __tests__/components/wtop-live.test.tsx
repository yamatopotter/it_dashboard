import { render, screen } from "@testing-library/react";
import { WtopScreen } from "@/components/wtop/wtop-screen";
import { buildMockSnapshot } from "@/components/tower/mock-snapshot";
import type { TowerProblem, TowerSnapshot } from "@/lib/tower-types";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

let snap: TowerSnapshot;
jest.mock("@/hooks/use-tower", () => ({
  useTower: () => ({ data: snap, error: null, ageSec: 0, fetchedAt: 1, frozen: false, refresh: jest.fn() }),
}));

const prob = (id: string, severity: TowerProblem["severity"]): TowerProblem => ({
  id: `DISP:${id}`, kind: "DISP", entityId: id, site: "BOT", name: id, severity, what: "offline", why: "", sinceSec: 5,
  children: [], acknowledged: false, ackBy: null, ackNote: null,
});

describe("wtop: aviso para leitor de tela", () => {
  it("anuncia só a transição para crítico", () => {
    snap = buildMockSnapshot();
    const { rerender } = render(<WtopScreen role="ADMIN" />);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();

    snap = { ...snap };
    rerender(<WtopScreen role="ADMIN" />);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();

    snap = { ...snap, problems: [...snap.problems, prob("sw-x", "warn")] };
    rerender(<WtopScreen role="ADMIN" />);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();

    snap = { ...snap, problems: snap.problems.map((p) => (p.entityId === "sw-x" ? { ...p, severity: "crit" as const } : p)) };
    rerender(<WtopScreen role="ADMIN" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Novo alerta crítico: sw-x offline");
  });
});

describe("wtop: links sem histórico", () => {
  it("spark vazio não desenha linha; com histórico desenha", () => {
    snap = buildMockSnapshot();
    snap = { ...snap, links: snap.links.map((l) => ({ ...l, spark: [] })) };
    const a = render(<WtopScreen role="ADMIN" />);
    expect(a.container.querySelector("#p1 svg.spark")).toBeNull();
    a.unmount();
    snap = buildMockSnapshot();
    const b = render(<WtopScreen role="ADMIN" />);
    expect(b.container.querySelector("#p1 svg.spark")).not.toBeNull();
  });
});
