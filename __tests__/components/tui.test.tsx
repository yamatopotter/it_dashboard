import { act, fireEvent, render, screen } from "@testing-library/react";
import { Age, Bar, Dots, FrozenBanner } from "@/components/tui";
import { useHotkeys } from "@/hooks/use-hotkeys";

describe("Age", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("formata e avança a cada segundo sem refetch", () => {
    render(<Age sec={862} />);
    expect(screen.getByText("14m22s")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText("14m25s")).toBeInTheDocument();
  });

  it("mostra traço sem valor", () => {
    render(<Age sec={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("FrozenBanner", () => {
  it("aparece com dados velhos", () => {
    render(<FrozenBanner frozen ageSec={64} />);
    expect(screen.getByRole("alert")).toHaveTextContent("DADOS CONGELADOS");
    expect(screen.getByRole("alert")).toHaveTextContent("1m04s");
  });
  it("cita worker sem heartbeat", () => {
    render(<FrozenBanner frozen ageSec={10} workerStale />);
    expect(screen.getByRole("alert")).toHaveTextContent("worker sem heartbeat");
  });
  it("some com dados frescos", () => {
    render(<FrozenBanner frozen={false} ageSec={3} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Bar e Dots", () => {
  it("Bar mostra o percentual ao lado", () => {
    render(<Bar pct={93} />);
    expect(screen.getByText("93%!")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "93");
  });
  it("Bar de link fora mostra DOWN", () => {
    render(<Bar pct={null} down />);
    expect(screen.getByText("DOWN")).toBeInTheDocument();
  });
  it("Dots descreve online/total", () => {
    render(<Dots states={["ok", "ok", "crit", "sup"]} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "2 de 4 online");
  });
});

describe("useHotkeys", () => {
  function Probe({ fn }: { fn: () => void }) {
    useHotkeys({ f: fn });
    return <input aria-label="campo" />;
  }

  it("dispara fora de campos", () => {
    const fn = jest.fn();
    render(<Probe fn={fn} />);
    fireEvent.keyDown(document.body, { key: "f" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("não dispara dentro de input", () => {
    const fn = jest.fn();
    render(<Probe fn={fn} />);
    fireEvent.keyDown(screen.getByLabelText("campo"), { key: "f" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("ignora Alt e Meta", () => {
    const fn = jest.fn();
    render(<Probe fn={fn} />);
    fireEvent.keyDown(document.body, { key: "f", altKey: true });
    fireEvent.keyDown(document.body, { key: "f", metaKey: true });
    expect(fn).not.toHaveBeenCalled();
  });
});
