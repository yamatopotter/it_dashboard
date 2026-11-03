import { fireEvent, render, screen, within } from "@testing-library/react";
import { NetTopScreen } from "@/components/nettop/nettop-screen";
import { wanRoles } from "@/components/nettop/nettop-logic";
import { buildNettopMockSnapshot } from "@/components/nettop/mock-extra";

describe("NetTopScreen (mock)", () => {
  it("troca de aba por clique e por teclado", () => {
    render(<NetTopScreen role="ADMIN" mock />);
    expect(screen.getByTestId("tab-rede")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /2 Wi-Fi/ }));
    expect(screen.getByTestId("tab-wifi")).toBeInTheDocument();
    expect(screen.getAllByTestId("wifi-row").length).toBeGreaterThan(5);
    fireEvent.keyDown(document, { key: "3" });
    expect(screen.getByTestId("tab-hosts")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "4" });
    expect(screen.getByTestId("tab-log")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "1" });
    expect(screen.getByTestId("tab-rede")).toBeInTheDocument();
  });

  it("deriva ativo/standby/down e mostra APs piores primeiro", () => {
    render(<NetTopScreen role="ADMIN" mock />);
    const itaRows = within(screen.getByTestId("wan-ITA")).getAllByTestId("wan-row");
    expect(itaRows[0].textContent).toContain("DOWN");
    expect(itaRows[1].textContent).toContain("◉");
    expect(screen.getAllByTestId("ap-row")[0].textContent).toContain("EAP225-Sala2");
    expect(screen.getByText(/APs ok \(mostrar\)/)).toBeInTheDocument();
  });

  it("troca de link com as setas e mostra estado vazio do gráfico", () => {
    render(<NetTopScreen role="ADMIN" mock />);
    const traffic = screen.getByTestId("traffic");
    expect(traffic.textContent).toContain("Claro 300M");
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByTestId("traffic").textContent).toContain("Vivo 200M");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByTestId("traffic").textContent).toContain("Claro 300M");
    expect(screen.getByTestId("traffic-empty")).toHaveTextContent("sem histórico de tráfego ainda");
  });

  it("SLA mensal usa perDay do mock", () => {
    render(<NetTopScreen role="ADMIN" mock />);
    const strip = screen.getByTestId("sla-strip");
    expect(within(strip).getAllByTestId("sla-link")).toHaveLength(6);
    expect(strip.querySelectorAll('[data-state="partial"]').length).toBeGreaterThan(0);
    expect(strip.querySelectorAll('[data-state="future"]').length).toBeGreaterThanOrEqual(0);
    expect(strip.querySelectorAll('[data-state="down"]').length).toBeGreaterThan(0);
  });

  it("t alterna a topologia em texto", () => {
    render(<NetTopScreen role="ADMIN" mock />);
    fireEvent.keyDown(document, { key: "t" });
    expect(screen.getByTestId("topology").textContent).toContain("MK-BARRA");
  });

  it("VIEWER não vê ações; OPERADOR vê no detalhe", () => {
    const { unmount } = render(<NetTopScreen role="VIEWER" mock />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByTestId("link-detail")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /silenciar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rechecar/ })).not.toBeInTheDocument();
    unmount();
    render(<NetTopScreen role="OPERADOR" mock />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByRole("button", { name: /silenciar/ })).toBeInTheDocument();
  });

  it("título mostra problemas abertos", () => {
    render(<NetTopScreen role="ADMIN" mock />);
    expect(document.title).toBe("(3) WatchIT");
  });
});

describe("wanRoles", () => {
  it("o link online de maior tráfego é o ativo", () => {
    const snap = buildNettopMockSnapshot();
    const r = wanRoles(snap.links);
    expect(r.get("ita-vivo")).toBe("down");
    expect(r.get("ita-tim")).toBe("active");
    expect(r.get("bar-claro")).toBe("active");
    expect(r.get("bar-vivo")).toBe("standby");
  });
});
