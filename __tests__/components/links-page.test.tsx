import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LinksPage from "@/app/(dashboard)/links/page";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
jest.mock("next/link", () => {
  const L = ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a>;
  L.displayName = "Link";
  return L;
});
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/link-detail-drawer", () => ({ LinkDetailDrawer: ({ linkId }: { linkId: string | null }) => (linkId ? <div>drawer:{linkId}</div> : null) }));

const base = {
  description: null, location: null, site: null, lastEventAt: null, createdAt: new Date().toISOString(),
  downloadBps: 5_000_000, uploadBps: 1_000_000, contractedDownloadBps: 10_000_000, contractedUploadBps: null,
  mikrotikDeviceId: null, mikrotikInterface: null, webhookToken: "tok", _count: { events: 0 },
};
const LINKS = [
  { ...base, id: "a", name: "Fibra Principal", isOnline: true },
  { ...base, id: "b", name: "Rádio Backup", isOnline: false },
];

beforeEach(() => {
  global.fetch = jest.fn((url: string) =>
    Promise.resolve({ ok: true, json: async () => (String(url).startsWith("/api/links") ? LINKS : []) }),
  ) as unknown as typeof fetch;
});
afterEach(() => jest.clearAllMocks());

describe("LinksPage (padrão TUI)", () => {
  it("lista links com glifo de estado e barra de banda", async () => {
    render(<LinksPage />);
    expect(await screen.findByText("Fibra Principal")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "online" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "offline" })).toBeInTheDocument();
    expect(screen.getAllByRole("meter", { name: /download contratado/ })[0]).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("1/2 online")).toBeInTheDocument();
  });

  it("filtra por offline e por busca", async () => {
    render(<LinksPage />);
    await screen.findByText("Fibra Principal");
    fireEvent.click(screen.getByRole("button", { name: /offline/ }));
    expect(screen.queryByText("Fibra Principal")).not.toBeInTheDocument();
    expect(screen.getByText("Rádio Backup")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /todos/ }));
    fireEvent.change(screen.getByLabelText("Buscar link"), { target: { value: "fibra" } });
    expect(screen.queryByText("Rádio Backup")).not.toBeInTheDocument();
  });

  it("atalhos: j/Enter abre o painel; n abre o formulário; ? abre a ajuda", async () => {
    render(<LinksPage />);
    await screen.findByText("Fibra Principal");
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByText("drawer:b")).toBeInTheDocument();
  });

  it("n abre o formulário em painel e valida o nome", async () => {
    render(<LinksPage />);
    await screen.findByText("Fibra Principal");
    fireEvent.keyDown(document, { key: "n" });
    expect(screen.getByRole("form", { name: "Novo link de internet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "criar" }));
    expect(await screen.findByText(/Nome obrigatório/)).toBeInTheDocument();
  });

  it("? abre a ajuda e Esc fecha", async () => {
    render(<LinksPage />);
    await screen.findByText("Fibra Principal");
    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Atalhos" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Atalhos" })).not.toBeInTheDocument());
  });

  it("mostra erro com retry quando a API falha", async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    render(<LinksPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os links");
  });
});
