import { fireEvent, render, screen, within } from "@testing-library/react";
import { WtopScreen } from "@/components/wtop/wtop-screen";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key: k, ...init });
const rowNames = () => screen.getAllByTestId("dev-row").map((r) => r.children[1].textContent);

beforeEach(() => push.mockClear());

describe("WtopScreen: foco de painel", () => {
  it("teclas 1-4 movem a classe de foco", () => {
    render(<WtopScreen role="ADMIN" mock />);
    expect(document.getElementById("p3")).toHaveClass("focus");
    for (const n of [1, 2, 4, 3]) {
      key(String(n));
      for (const id of ["p1", "p2", "p3", "p4"]) {
        expect(document.getElementById(id)!.classList.contains("focus")).toBe(id === `p${n}`);
      }
    }
  });

  it("Tab cicla e Shift+Tab volta", () => {
    render(<WtopScreen role="ADMIN" mock />);
    key("Tab");
    expect(document.getElementById("p4")).toHaveClass("focus");
    key("Tab");
    expect(document.getElementById("p1")).toHaveClass("focus");
    key("Tab", { shiftKey: true });
    expect(document.getElementById("p4")).toHaveClass("focus");
  });

  it("j/k movem no painel focado e Enter abre o detalhe", () => {
    render(<WtopScreen role="ADMIN" mock />);
    key("4");
    const first = rowNames()[0];
    key("Enter");
    expect(screen.getByText(`· ${first}`)).toBeInTheDocument();
    key("j");
    key("Enter");
    expect(screen.getByText(`· ${rowNames()[1]}`)).toBeInTheDocument();
    key("k");
    expect(screen.getAllByTestId("dev-row")[0]).toHaveAttribute("aria-current", "true");
  });

  it("/ foca o filtro e o texto filtra a lista", () => {
    render(<WtopScreen role="ADMIN" mock />);
    key("/");
    const input = screen.getByLabelText("Filtro de dispositivos");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "sede:bot off" } });
    expect(rowNames()).toEqual(expect.arrayContaining(["NVR-02"]));
    expect(rowNames().every((n) => n !== "RB5009")).toBe(true);
    fireEvent.change(input, { target: { value: "sede:xyz" } });
    expect(screen.getByText(/ignorado: sede:xyz/)).toBeInTheDocument();
  });

  it("g+i filtra a unidade Itaguaí; g+t volta a todas", () => {
    render(<WtopScreen role="ADMIN" mock />);
    const all = screen.getAllByTestId("link-row").length;
    key("g");
    key("i");
    expect(screen.getAllByTestId("link-row")).toHaveLength(2);
    expect(screen.queryByText("NVR-02")).not.toBeInTheDocument();
    key("g");
    key("t");
    expect(screen.getAllByTestId("link-row")).toHaveLength(all);
  });

  it("i sem g não filtra", () => {
    render(<WtopScreen role="ADMIN" mock />);
    const all = screen.getAllByTestId("link-row").length;
    key("i");
    expect(screen.getAllByTestId("link-row")).toHaveLength(all);
  });
});

describe("WtopScreen: ordenação por cabeçalho", () => {
  it("NOME alterna ascendente e descendente", () => {
    render(<WtopScreen role="ADMIN" mock />);
    const btn = screen.getByRole("button", { name: "NOME" });
    fireEvent.click(btn);
    const asc = rowNames().map((n) => n!.toLowerCase());
    expect(asc).toEqual([...asc].sort((a, b) => a.localeCompare(b)));
    expect(btn.closest("[role=columnheader]")).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(btn);
    expect(rowNames().map((n) => n!.toLowerCase())).toEqual([...asc].reverse());
    expect(btn.closest("[role=columnheader]")).toHaveAttribute("aria-sort", "descending");
  });
});

describe("WtopScreen: paleta de comandos", () => {
  it("Ctrl+K abre; buscar um ativo e Enter abre o detalhe", () => {
    render(<WtopScreen role="ADMIN" mock />);
    key("k", { ctrlKey: true });
    const input = screen.getByLabelText("Buscar comando ou ativo");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "nvr-02" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: "Paleta de comandos" })).not.toBeInTheDocument();
    expect(screen.getByText("· NVR-02")).toBeInTheDocument();
  });

  it(": abre e um comando navega com o router", () => {
    render(<WtopScreen role="ADMIN" mock />);
    key(":");
    const input = screen.getByLabelText("Buscar comando ou ativo");
    fireEvent.change(input, { target: { value: "users" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/users");
  });

  it("novo dispositivo vai para /devices/new; Escape fecha", () => {
    render(<WtopScreen role="OPERADOR" mock />);
    key("k", { ctrlKey: true });
    const input = screen.getByLabelText("Buscar comando ou ativo");
    fireEvent.change(input, { target: { value: "novo disp" } });
    fireEvent.click(within(screen.getByRole("listbox", { name: "Resultados" })).getAllByRole("option")[0]);
    expect(push).toHaveBeenCalledWith("/devices/new");
    key("k", { ctrlKey: true });
    key("Escape");
    expect(screen.queryByRole("dialog", { name: "Paleta de comandos" })).not.toBeInTheDocument();
  });

  it("não oferece comandos de admin nem criação para VIEWER", () => {
    render(<WtopScreen role="VIEWER" mock />);
    key(":");
    const input = screen.getByLabelText("Buscar comando ou ativo");
    fireEvent.change(input, { target: { value: "/users" } });
    expect(screen.getByText("nada encontrado")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "novo dispositivo" } });
    expect(screen.queryByText(/novo dispositivo ·/)).not.toBeInTheDocument();
  });
});

describe("WtopScreen: VIEWER e detalhe", () => {
  it("VIEWER não vê ping, ack nem silenciar, mas copia IP", () => {
    render(<WtopScreen role="VIEWER" mock />);
    key("4");
    key("Enter");
    expect(screen.queryByRole("button", { name: /ping/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ack/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /silenciar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copiar IP/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /web/ })).toBeInTheDocument();
  });

  it("OPERADOR vê as cinco ações e troca de aba", () => {
    render(<WtopScreen role="OPERADOR" mock />);
    key("4");
    key("Enter");
    for (const n of [/ping/, /web/, /copiar IP/, /ack/, /silenciar/]) expect(screen.getByRole("button", { name: n })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "histórico" }));
    expect(screen.getByRole("tab", { name: "histórico" })).toHaveAttribute("aria-selected", "true");
  });

  it("título da aba mostra problemas abertos", () => {
    render(<WtopScreen role="ADMIN" mock />);
    expect(document.title).toBe("(3) WatchIT");
  });

  it("problema com dependentes mostra filhos recuados e o resumo dos demais", () => {
    render(<WtopScreen role="ADMIN" mock />);
    expect(screen.getByText(/\+9 suprimidos/)).toBeInTheDocument();
  });
});
