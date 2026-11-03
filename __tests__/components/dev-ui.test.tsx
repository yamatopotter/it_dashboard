import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { DevEmpty, DevError, DevLoading, DevPage, useListKeys } from "@/components/tui/dev-shell";
import { DevTable, KpiStrip, NetAlert, PanelToggle, SignalCell, UsageBar, type Col } from "@/components/dev-net-panels";
import { StatusBadge } from "@/components/status-badge";
import { DeviceTypeBadge } from "@/components/device-type-badge";

jest.mock("next/link", () => {
  const L = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  );
  L.displayName = "Link";
  return L;
});

describe("DevPage", () => {
  it("renderiza título, voltar, ações e rodapé de atalhos", () => {
    render(
      <DevPage title="Dispositivos" sub="3/3" back="/x" backLabel="início" actions={<button>ação</button>} hints={[{ keys: ["j"], label: "mover" }]}>
        <p>conteúdo</p>
      </DevPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Dispositivos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /voltar: início/i })).toHaveAttribute("href", "/x");
    expect(screen.getByRole("button", { name: "ação" })).toBeInTheDocument();
    expect(screen.getByLabelText("Atalhos de teclado")).toHaveTextContent("mover");
    expect(document.querySelector(".tui")).toBeInTheDocument();
  });

  it("mostra a ajuda quando aberta", () => {
    const onClose = jest.fn();
    render(
      <DevPage title="T" help={[["j", "mover"]]} helpOpen onHelpClose={onClose}>
        x
      </DevPage>,
    );
    expect(screen.getByRole("dialog", { name: "Atalhos" })).toBeInTheDocument();
  });
});

describe("estados", () => {
  it("vazio", () => {
    render(<DevEmpty title="Nada aqui" hint="dica" />);
    expect(screen.getByRole("status")).toHaveTextContent("Nada aqui");
  });
  it("erro com nova tentativa", () => {
    const retry = jest.fn();
    render(<DevError message="Falhou" onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("✖ Falhou");
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(retry).toHaveBeenCalled();
  });
  it("carregando é ocupado para leitores de tela", () => {
    render(<DevLoading rows={2} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});

function Harness({ onOpen }: { onOpen: (i: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const { sel, help } = useListKeys({ count: 3, onOpen, searchRef: ref });
  return (
    <div>
      <input ref={ref} aria-label="busca" />
      <span data-testid="sel">{sel}</span>
      <span data-testid="help">{String(help)}</span>
    </div>
  );
}

describe("useListKeys", () => {
  it("j/k movem a seleção sem passar dos limites, Enter abre, / foca a busca, ? abre a ajuda", () => {
    const onOpen = jest.fn();
    render(<Harness onOpen={onOpen} />);
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "j" });
    expect(screen.getByTestId("sel")).toHaveTextContent("2");
    fireEvent.keyDown(document, { key: "k" });
    expect(screen.getByTestId("sel")).toHaveTextContent("1");
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(1);
    fireEvent.keyDown(document, { key: "/" });
    expect(screen.getByLabelText("busca")).toHaveFocus();
    // dentro do campo, as teclas não disparam atalhos
    fireEvent.keyDown(screen.getByLabelText("busca"), { key: "j" });
    expect(screen.getByTestId("sel")).toHaveTextContent("1");
    (screen.getByLabelText("busca") as HTMLInputElement).blur();
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByTestId("help")).toHaveTextContent("true");
  });
});

describe("painéis de rede", () => {
  it("KpiStrip usa glifo além da cor", () => {
    render(<KpiStrip items={[{ label: "Online", value: "2/3", tone: "warn" }, { label: "Clientes", value: "9" }]} />);
    expect(screen.getByText(/▲ 2\/3/)).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("UsageBar mostra o percentual ao lado e o nível", () => {
    render(<UsageBar value={92} label="CPU" />);
    expect(screen.getByRole("meter", { name: "CPU" })).toHaveAttribute("aria-valuenow", "92");
    expect(screen.getByText("92%")).toHaveClass("crit");
  });

  it("UsageBar sem valor mostra traço", () => {
    render(<UsageBar value={null} label="CPU" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("SignalCell classifica o sinal", () => {
    const { rerender } = render(<SignalCell signal={-50} snr={30} />);
    expect(screen.getByText(/● -50 dBm/)).toHaveClass("ok");
    rerender(<SignalCell signal={-70} />);
    expect(screen.getByText(/▲ -70 dBm/)).toHaveClass("warn");
    rerender(<SignalCell signal={-85} />);
    expect(screen.getByText(/✖ -85 dBm/)).toHaveClass("crit");
  });

  it("NetAlert crítico usa role=alert", () => {
    render(<NetAlert tone="crit">falha</NetAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("✖ falha");
  });

  it("PanelToggle expõe aria-expanded e esconde o conteúdo", () => {
    const toggle = jest.fn();
    const { rerender } = render(<PanelToggle open={false} onToggle={toggle} label="Clientes" count={4}>corpo</PanelToggle>);
    const btn = screen.getByRole("button", { name: /clientes/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("corpo")).not.toBeInTheDocument();
    fireEvent.click(btn);
    expect(toggle).toHaveBeenCalled();
    rerender(<PanelToggle open onToggle={toggle} label="Clientes" count={4}>corpo</PanelToggle>);
    expect(screen.getByText("corpo")).toBeInTheDocument();
  });

  it("DevTable renderiza linhas e cabeçalho ordenável", () => {
    const sort = jest.fn();
    const cols: Col<{ n: string }>[] = [{ key: "n", head: "Nome", cell: (r) => r.n, onSort: sort, sorted: true }];
    render(<DevTable label="t" cols={cols} rows={[{ n: "a" }, { n: "b" }]} rowKey={(r) => r.n} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: /nome/i }));
    expect(sort).toHaveBeenCalled();
  });
});

describe("badges de estado", () => {
  it("StatusBadge combina glifo e texto para cada estado", () => {
    const { container, rerender } = render(<StatusBadge isOnline />);
    expect(container).toHaveTextContent("●Online");
    rerender(<StatusBadge isOnline={false} />);
    expect(container).toHaveTextContent("✖Offline");
    rerender(<StatusBadge isOnline degraded />);
    expect(container).toHaveTextContent("▲Instável");
    rerender(<StatusBadge isOnline={false} acknowledged />);
    expect(container).toHaveTextContent("░Offline reconhecido");
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Offline reconhecido");
  });

  it("DeviceTypeBadge usa rótulo em texto", () => {
    render(<DeviceTypeBadge type="OMADA_AP" />);
    expect(screen.getByText("Omada AP")).toBeInTheDocument();
  });
});
