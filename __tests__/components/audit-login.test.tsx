import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditClient } from "@/app/(dashboard)/audit/audit-client";
import LoginPage from "@/app/login/page";

jest.mock("next/link", () => {
  const L = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>;
  L.displayName = "Link";
  return L;
});
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("next-auth/react", () => ({ signIn: jest.fn().mockResolvedValue({ error: "x" }) }));

const LOG = {
  id: "1", timestamp: "2026-11-03T12:00:00Z", userId: null, username: "ana", ipAddress: "10.0.0.1",
  action: "DELETE", entity: "Device", entityId: "d1", entityName: "Switch", details: null,
};

describe("AuditClient (TUI)", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/admin/audit/stats")) {
        return { ok: true, json: async () => ({ last24h: { LOGIN_FAILED: 2 }, last7d: {}, total24h: 5, total7d: 9, recentLogins: [], topUsers: [] }) };
      }
      return { ok: true, json: async () => ({ logs: [LOG], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } }) };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("lista registros com badge de ação e destaca falhas de login", async () => {
    render(<AuditClient />);
    expect(await screen.findByText("Switch")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Log de auditoria" })).getByText("exclusão").closest(".tui-badge-crit")).toHaveTextContent("✖");
    expect(screen.getByText(/falhas de login 24h/i)).toBeInTheDocument();
  });

  it("filtrar por ação refaz a consulta com o parâmetro", async () => {
    render(<AuditClient />);
    await screen.findByText("Switch");
    await userEvent.selectOptions(screen.getByLabelText("Ação"), "DELETE");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("action=DELETE"))).toBe(true));
  });

  it("purga só habilita após digitar CONFIRMAR", async () => {
    render(<AuditClient />);
    await screen.findByText("Switch");
    const btn = screen.getByRole("button", { name: "Executar purga" });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Digite CONFIRMAR/), "CONFIRMAR");
    expect(btn).toBeEnabled();
  });
});

describe("LoginPage (TUI)", () => {
  it("mostra usuário/senha e alterna visibilidade da senha", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    render(<LoginPage />);
    const pass = screen.getByLabelText("Senha");
    expect(pass).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(pass).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
