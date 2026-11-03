import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DevicesPage from "@/app/(dashboard)/devices/page";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("next/link", () => {
  const L = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  );
  L.displayName = "Link";
  return L;
});
jest.mock("@/components/device-detail-drawer", () => ({
  DeviceDetailDrawer: ({ deviceId }: { deviceId: string | null }) => <div data-testid="drawer">{deviceId ?? "fechado"}</div>,
}));
jest.mock("@/components/device-interval-dialog", () => ({ GlobalIntervalModal: () => <button>intervalo</button> }));
// Funções estáveis: um `notify` novo a cada render recriaria o `load` e refaria o polling sem parar.
const stable = { notify: jest.fn(), requestPermission: jest.fn() };
jest.mock("@/hooks/use-device-notifications", () => ({
  useDeviceNotifications: () => stable,
}));

const mk = (id: string, name: string, ip: string, online: boolean, ping: number | null, type = "MIKROTIK") => ({
  id, name, ip, type, location: "Sala TI", offlineAcknowledgedAt: null,
  currentStatus: { isOnline: online, pingMs: ping, cpuLoad: online ? 95 : null, uptime: 3600, checkedAt: new Date().toISOString() },
});

const DEVICES = [
  mk("a", "Alpha", "10.0.0.1", true, 10),
  mk("b", "Beta", "10.0.0.2", false, null, "UNIFI_AP"),
  mk("c", "Gamma", "10.0.0.3", true, 200),
];

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  push.mockClear();
  global.fetch = jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes("/api/overview") ? { sparklines: {} } : DEVICES),
    }),
  ) as unknown as typeof fetch;
});

async function setup() {
  await act(async () => { render(<DevicesPage />); });
  await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());
}

describe("DevicesPage (TUI)", () => {
  it("lista dispositivos em tabela densa com glifo de estado", async () => {
    await setup();
    expect(screen.getByRole("heading", { level: 1, name: "Dispositivos" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /lista de dispositivos/i })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "Offline" })).toHaveLength(1);
    expect(screen.getAllByRole("status", { name: "Instável" })).toHaveLength(1);
    expect(screen.getByText(/1 offline/)).toBeInTheDocument();
  });

  it("filtra por status e por busca", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: /✖ offline/ }));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("busca por nome ou IP", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Buscar dispositivos"), { target: { value: "10.0.0.3" } });
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("mostra estado vazio quando nada casa", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Buscar dispositivos"), { target: { value: "zzz" } });
    expect(screen.getByText(/nenhum dispositivo encontrado/i)).toBeInTheDocument();
  });

  it("teclado: j move, Enter abre o drawer, e edita, n cria, v alterna a visão", async () => {
    await setup();
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByTestId("drawer")).toHaveTextContent("b");
    // com o drawer aberto os atalhos de lista ficam desativados
    fireEvent.keyDown(document, { key: "n" });
    expect(push).not.toHaveBeenCalled();
  });

  it("atalhos e / n v", async () => {
    await setup();
    fireEvent.keyDown(document, { key: "e" });
    expect(push).toHaveBeenCalledWith("/devices/a/edit");
    fireEvent.keyDown(document, { key: "n" });
    expect(push).toHaveBeenCalledWith("/devices/new");
    fireEvent.keyDown(document, { key: "v" });
    await waitFor(() => expect(localStorage.getItem("devices-view-mode")).toBe("cards"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /abrir detalhe/i })).toHaveLength(3);
  });

  it("? abre a ajuda de atalhos", async () => {
    await setup();
    act(() => { fireEvent.keyDown(document, { key: "?" }); });
    expect(screen.getByRole("dialog", { name: "Atalhos" })).toBeInTheDocument();
  });

  it("mostra erro com nova tentativa quando a API falha", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    await act(async () => { render(<DevicesPage />); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível carregar/i));
  });
});
