import { render, screen } from "@testing-library/react";
import { BandwidthCell } from "@/components/bandwidth-cell";

describe("BandwidthCell (padrão TUI)", () => {
  it("mostra 'sem dados' quando current é null", () => {
    render(<BandwidthCell current={null} contracted={null} color="success" />);
    expect(screen.getByText("sem dados")).toBeInTheDocument();
  });

  it("mostra o valor formatado", () => {
    render(<BandwidthCell current={1_000_000} contracted={null} color="success" />);
    expect(screen.getByText("1.0 Mbps")).toBeInTheDocument();
  });

  it("mostra o teto contratado e a barra com percentual ao lado", () => {
    render(<BandwidthCell current={5_000_000} contracted={10_000_000} color="success" />);
    expect(screen.getByText("/ 10.0 Mbps")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("não mostra barra nem teto sem banda contratada", () => {
    render(<BandwidthCell current={1_000_000} contracted={null} color="primary" />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it("marca uso >= 90% como crítico com '!' (não só cor)", () => {
    const { container } = render(<BandwidthCell current={9_500_000} contracted={10_000_000} color="success" />);
    expect(screen.getByText("95%!")).toBeInTheDocument();
    expect(container.querySelector(".bar.c")).toBeInTheDocument();
  });

  it("marca 70-90% como aviso", () => {
    const { container } = render(<BandwidthCell current={7_500_000} contracted={10_000_000} color="success" />);
    expect(container.querySelector(".bar.w")).toBeInTheDocument();
  });

  it("limita o percentual a 100%", () => {
    render(<BandwidthCell current={20_000_000} contracted={10_000_000} color="success" />);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
  });

  it("mostra Kbps para valores abaixo de 1 Mbps", () => {
    render(<BandwidthCell current={500_000} contracted={null} color="success" />);
    expect(screen.getByText("500 Kbps")).toBeInTheDocument();
  });

  it("download usa 'ok' e upload usa 'info' no valor", () => {
    const { container, rerender } = render(<BandwidthCell current={1_000_000} contracted={null} color="success" />);
    expect(container.querySelector(".v.ok")).toBeInTheDocument();
    rerender(<BandwidthCell current={1_000_000} contracted={null} color="primary" />);
    expect(container.querySelector(".v.info")).toBeInTheDocument();
  });
});
