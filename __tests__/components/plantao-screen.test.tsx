import { fireEvent, render, screen, within } from "@testing-library/react";
import { PlantaoScreen } from "@/components/plantao/plantao-screen";

describe("PlantaoScreen (mock)", () => {
  it("renderiza uma coluna por unidade com status no cabeçalho", () => {
    render(<PlantaoScreen role="ADMIN" mock />);
    expect(screen.getByText("[1] BARRA")).toBeInTheDocument();
    expect(screen.getByText("[2] BOTAFOGO")).toBeInTheDocument();
    expect(screen.getByText("[3] ITAGUAÍ")).toBeInTheDocument();
    expect(screen.getByLabelText("Destacar Itaguaí")).toHaveTextContent("✖ 1");
    expect(screen.getByLabelText("Destacar Barra")).toHaveTextContent("▲ 1");
    expect(screen.getByText("[?] SEM UNIDADE")).toBeInTheDocument();
  });

  it("agrupa a fila por causa provável e mostra o impacto", () => {
    render(<PlantaoScreen role="ADMIN" mock />);
    expect(screen.getByText("PROBLEMAS AGORA")).toBeInTheDocument();
    const rows = screen.getAllByTestId("problem-row");
    expect(rows[0]).toHaveTextContent("Vivo 500M");
    expect(rows[0]).toHaveTextContent("afeta 12 disp.");
  });

  it("busca filtra links, dispositivos e APs", () => {
    render(<PlantaoScreen role="ADMIN" mock />);
    const input = screen.getByPlaceholderText(/digite um nome/);
    fireEvent.change(input, { target: { value: "172.16.1.200" } });
    const res = screen.getAllByTestId("search-result");
    expect(res).toHaveLength(1);
    expect(res[0]).toHaveTextContent("UniFi CloudKey");
    fireEvent.change(input, { target: { value: "eap225" } });
    expect(within(screen.getAllByTestId("search-result")[0]).getByText("EAP225-Sala2")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(screen.getByText(/nada encontrado/)).toBeInTheDocument();
  });

  it("tecla / foca a busca e teclas são ignoradas dentro do input", () => {
    render(<PlantaoScreen role="ADMIN" mock />);
    const input = screen.getByPlaceholderText(/digite um nome/);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "1" });
    expect(screen.getByLabelText("Destacar Barra")).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(document.body, { key: "1" });
    expect(screen.getByLabelText("Destacar Barra")).toHaveAttribute("aria-pressed", "true");
  });

  it("título da aba mostra problemas abertos", () => {
    render(<PlantaoScreen role="ADMIN" mock />);
    expect(document.title).toBe("(3) WatchIT");
  });

  it("VIEWER não vê ações que alteram estado", () => {
    render(<PlantaoScreen role="VIEWER" mock />);
    expect(screen.queryByRole("button", { name: /manutenção/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^a ack/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rechecar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar resumo/ })).toBeInTheDocument();
  });

  it("OPERADOR vê ack, manutenção e rechecar", () => {
    render(<PlantaoScreen role="OPERADOR" mock />);
    expect(screen.getByRole("button", { name: /manutenção 1h/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rechecar/ })).toBeInTheDocument();
  });
});
