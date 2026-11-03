import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { Panel, TuiPage, StatusBadge, EmptyBox, ErrorBox, SkeletonRows, Field } from "@/components/tui";
import { Age } from "@/components/tui/age";

jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  );
  MockLink.displayName = "Link";
  return MockLink;
});
jest.mock("next/navigation", () => ({ usePathname: jest.fn().mockReturnValue("/devices/1") }));
jest.mock("next-auth/react", () => ({ signOut: jest.fn() }));
jest.mock("next-themes", () => ({ useTheme: () => ({ setTheme: jest.fn(), resolvedTheme: "light" }) }));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
});

describe("Sidebar (TUI)", () => {
  it("marca a rota ativa com aria-current", () => {
    render(<Sidebar />);
    expect(screen.getByText("Dispositivos").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Painel").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("alerta de offline usa glifo além da cor", () => {
    render(<Sidebar initialCounts={{ devicesTotal: 5, devicesOffline: 2, linksOnline: 1, linksTotal: 1 }} />);
    const badge = screen.getAllByTitle("2 com problema")[0];
    expect(badge).toHaveTextContent("✖");
  });

  it("botão de menu alterna o painel no mobile", async () => {
    render(<Sidebar />);
    const toggle = screen.getByRole("button", { name: "Abrir menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Menu lateral")).toHaveAttribute("data-open", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByLabelText("Menu lateral")).toHaveAttribute("data-open", "false");
  });

  it("esconde Administração para quem não é ADMIN", () => {
    render(<Sidebar userRole="OPERADOR" />);
    expect(screen.queryByText("Usuários")).not.toBeInTheDocument();
    render(<Sidebar userRole="ADMIN" />);
    expect(screen.getByText("Usuários")).toBeInTheDocument();
  });
});

describe("Topbar (TUI)", () => {
  it("usa o cabeçalho padrão .tui-head com título h1", () => {
    const { container } = render(<Topbar title="Teste" />);
    expect(container.querySelector("header.tui-head")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Teste");
  });
});

describe("primitivas de página", () => {
  it("Panel funciona fora de .tui e liga o título ao painel", () => {
    render(<Panel title="resumo" id="p1">conteúdo</Panel>);
    expect(screen.getByRole("region", { name: "resumo" })).toHaveClass("tui-panel");
  });

  it("TuiPage aplica .tui + .tui-page (e narrow)", () => {
    const { container } = render(<TuiPage narrow>x</TuiPage>);
    expect(container.firstChild).toHaveClass("tui", "tui-page", "tui-narrow");
  });

  it("StatusBadge inclui glifo", () => {
    render(<StatusBadge level="crit">offline</StatusBadge>);
    expect(screen.getByText("offline").closest(".tui-badge-crit")).toHaveTextContent("✖");
  });

  it("estados vazio, erro (com retry) e esqueleto", async () => {
    const retry = jest.fn();
    render(
      <>
        <EmptyBox title="Nada aqui" hint="dica" />
        <ErrorBox message="falhou" onRetry={retry} />
        <SkeletonRows rows={2} />
      </>
    );
    expect(screen.getByText("Nada aqui")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("falhou");
    await userEvent.click(screen.getByRole("button", { name: "tentar de novo" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("status", { name: "Carregando" }).children).toHaveLength(2);
  });

  it("Field liga rótulo ao controle e mostra erro no lugar da dica", () => {
    render(
      <Field id="f" label="Nome" hint="dica" error="obrigatório">
        <input id="f" className="tui-input" />
      </Field>
    );
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByText("obrigatório")).toBeInTheDocument();
    expect(screen.queryByText("dica")).not.toBeInTheDocument();
  });

  it("Age mostra traço sem valor e o texto formatado com valor", () => {
    const { rerender } = render(<Age sec={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<Age sec={125} />);
    expect(screen.getByText(/^2m05s/)).toBeInTheDocument();
  });
});
