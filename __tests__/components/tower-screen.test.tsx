import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TowerScreen } from "@/components/tower/tower-screen";
import { buildMockSnapshot } from "@/components/tower/mock-snapshot";

describe("TowerScreen (mock)", () => {
  it("renderiza os problemas do mock", () => {
    render(<TowerScreen role="ADMIN" mock />);
    expect(screen.getAllByText("Vivo 500M").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NVR-02").length).toBeGreaterThan(0);
    expect(screen.getByText(/\+12 dependentes de ITA/)).toBeInTheDocument();
    expect(screen.getByText(/matheus: "troca de cabo"/)).toBeInTheDocument();
  });

  it("ordena a fila: crítico, aviso, ack", () => {
    render(<TowerScreen role="ADMIN" mock />);
    const rows = screen.getAllByTestId("problem-row").map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Vivo 500M");
    expect(rows[1]).toContain("NVR-02");
    expect(rows[2]).toContain("Claro 300M");
    expect(rows[3]).toContain("AP-Recepção");
  });

  it("título da aba mostra problemas abertos", () => {
    render(<TowerScreen role="ADMIN" mock />);
    expect(document.title).toBe("(3) WatchIT");
  });

  it("esconde ações para VIEWER", () => {
    render(<TowerScreen role="VIEWER" mock />);
    expect(screen.queryByRole("button", { name: /silenciar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^a ack/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /c copiar/ }).length).toBeGreaterThan(0);
  });

  it("mostra ações para OPERADOR", () => {
    render(<TowerScreen role="OPERADOR" mock />);
    expect(screen.getAllByRole("button", { name: /s silenciar/ }).length).toBeGreaterThan(0);
  });

  it("modo TV esconde ações e rodapé", () => {
    render(<TowerScreen role="ADMIN" mock tv />);
    expect(screen.queryByRole("button", { name: /s silenciar/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Atalhos de teclado")).not.toBeInTheDocument();
  });

  it("tecla f alterna só problemas, mas não dentro do campo de ack", () => {
    render(<TowerScreen role="ADMIN" mock />);
    const toggle = screen.getByRole("button", { name: /só problemas/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(document.body, { key: "f" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(document.body, { key: "f" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(document.body, { key: "a" });
    const input = screen.getByLabelText("Nota do ack");
    fireEvent.keyDown(input, { key: "f" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("j/k movem a seleção e ? abre a ajuda", () => {
    render(<TowerScreen role="ADMIN" mock />);
    const rows = () => screen.getAllByTestId("problem-row");
    expect(rows()[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.body, { key: "j" });
    expect(rows()[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(document.body, { key: "?" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("chip de unidade filtra os problemas", () => {
    render(<TowerScreen role="ADMIN" mock />);
    fireEvent.keyDown(document.body, { key: "3" });
    expect(screen.getAllByTestId("problem-row")).toHaveLength(1);
  });
});

describe("TowerScreen (rede)", () => {
  afterEach(() => { delete (global as { fetch?: unknown }).fetch; });

  it("erro de rede mostra DADOS CONGELADOS sem quebrar", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    render(<TowerScreen role="ADMIN" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("DADOS CONGELADOS"));
  });

  it("worker stale mostra DADOS CONGELADOS", async () => {
    const snap = buildMockSnapshot();
    snap.health.workerStatus = "stale";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, headers: { get: () => '"v1"' }, json: async () => snap,
    }) as unknown as typeof fetch;
    render(<TowerScreen role="ADMIN" />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("worker sem heartbeat"));
    expect(screen.getAllByText("Vivo 500M").length).toBeGreaterThan(0);
  });
});
