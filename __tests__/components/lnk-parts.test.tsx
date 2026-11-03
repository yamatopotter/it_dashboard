import { render, screen, fireEvent } from "@testing-library/react";
import { LnkChips, LnkToggle, LnkEmpty, LnkError, LnkField, LnkLoading } from "@/components/tui/lnk-parts";
import { LnkShell } from "@/components/tui/lnk-shell";
import { renderHook, act } from "@testing-library/react";
import { useListNav } from "@/hooks/use-list-nav";

jest.mock("next/link", () => {
  const L = ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a>;
  L.displayName = "Link";
  return L;
});

describe("lnk-parts", () => {
  it("LnkChips marca o ativo com aria-pressed e dispara onChange", () => {
    const onChange = jest.fn();
    render(<LnkChips label="Filtro" value="A" onChange={onChange} chips={[{ value: "A", label: "um", key: "1", count: 3 }, { value: "B", label: "dois" }]} />);
    expect(screen.getByRole("button", { name: /um/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /dois/ }));
    expect(onChange).toHaveBeenCalledWith("B");
  });

  it("LnkToggle alterna", () => {
    const onToggle = jest.fn();
    render(<LnkToggle label="alertas" on={false} onToggle={onToggle} k="a" />);
    fireEvent.click(screen.getByRole("button", { name: /alertas/ }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("estados: carregando, vazio e erro com retry", () => {
    const retry = jest.fn();
    render(<><LnkLoading what="links" /><LnkEmpty ok title="Nada aqui" hint="dica" /><LnkError message="falhou" onRetry={retry} /></>);
    expect(screen.getByRole("status")).toHaveTextContent("carregando links");
    expect(screen.getByText(/Nada aqui/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("falhou");
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/ }));
    expect(retry).toHaveBeenCalled();
  });

  it("LnkField associa erro ao campo", () => {
    render(<LnkField id="x" label="Nome" error="obrigatório"><input id="x" /></LnkField>);
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("obrigatório");
  });

  it("LnkShell mostra título, rodapé de atalhos e ajuda", () => {
    const onHelpClose = jest.fn();
    render(
      <LnkShell title="LINKS" sub="2/3 online" back={{ href: "/x", label: "voltar" }} hints={[{ keys: ["j"], label: "descer" }]} help={[["j", "descer"]]} helpOpen onHelpClose={onHelpClose}>
        <p>conteúdo</p>
      </LnkShell>,
    );
    expect(screen.getByRole("heading", { name: "LINKS" })).toBeInTheDocument();
    expect(screen.getByText("2/3 online")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo", { name: /atalhos/i })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Atalhos" })).toBeInTheDocument();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});

describe("useListNav", () => {
  it("move com j/k respeitando os limites", () => {
    const { result } = renderHook(() => useListNav(3));
    expect(result.current.sel).toBe(0);
    act(() => result.current.keys.j());
    act(() => result.current.keys.j());
    act(() => result.current.keys.j());
    expect(result.current.sel).toBe(2);
    act(() => result.current.keys.k());
    expect(result.current.sel).toBe(1);
    act(() => result.current.keys.Home());
    expect(result.current.sel).toBe(0);
    act(() => result.current.keys.End());
    expect(result.current.sel).toBe(2);
  });

  it("lista vazia retorna -1 e a seleção encolhe com a lista", () => {
    const { result, rerender } = renderHook(({ n }) => useListNav(n), { initialProps: { n: 5 } });
    act(() => result.current.keys.End());
    expect(result.current.sel).toBe(4);
    rerender({ n: 2 });
    expect(result.current.sel).toBe(1);
    rerender({ n: 0 });
    expect(result.current.sel).toBe(-1);
  });
});
