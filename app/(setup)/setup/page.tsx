"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type DbProvider = "sqlite" | "mysql" | "postgresql";
type Step = 1 | 2 | 3 | 4;

interface DbForm {
  provider: DbProvider;
  sqlitePath: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

interface AdminForm {
  username: string;
  password: string;
  confirm: string;
}

const DEFAULT_DB: DbForm = {
  provider: "sqlite",
  sqlitePath: "./data/watchit.db",
  host: "localhost",
  port: "5432",
  database: "watchit",
  username: "watchit",
  password: "",
};

// ── Small UI primitives ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
    />
  );
}

function ProviderCard({
  value,
  current,
  label,
  description,
  onClick,
}: {
  value: DbProvider;
  current: DbProvider;
  label: string;
  description: string;
  onClick: () => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div className="font-semibold text-sm text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
    </button>
  );
}

function StatusDot({ done, active }: { done: boolean; active: boolean }) {
  if (done) return <span className="text-success">✓</span>;
  if (active) return <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-border" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep]           = useState<Step>(1);
  const [db, setDb]               = useState<DbForm>(DEFAULT_DB);
  const [admin, setAdmin]         = useState<AdminForm>({ username: "", password: "", confirm: "" });
  const [testState, setTestState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [testError, setTestError] = useState("");
  const [applyLog, setApplyLog]   = useState<string[]>([]);
  const [applyDone, setApplyDone] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [errors, setErrors]       = useState<Record<string, string>>({});

  // Redirect away if setup is already complete
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d: { complete: boolean }) => { if (d.complete) router.replace("/"); })
      .catch(() => {});
  }, [router]);

  // ── DB form helpers ────────────────────────────────────────────────────────

  function updateDb(field: keyof DbForm, value: string) {
    setDb((prev) => ({ ...prev, [field]: value }));
    setTestState("idle");
    setTestError("");
  }

  function setProvider(p: DbProvider) {
    setDb((prev) => ({
      ...prev,
      provider: p,
      port: p === "mysql" ? "3306" : p === "postgresql" ? "5432" : prev.port,
    }));
    setTestState("idle");
    setTestError("");
  }

  async function handleTestDb() {
    setTestState("loading");
    setTestError("");
    try {
      const res = await fetch("/api/setup/test-db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(db),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        setTestState("ok");
      } else {
        setTestState("error");
        setTestError(data.error ?? "Falha na conexão");
      }
    } catch {
      setTestState("error");
      setTestError("Erro de rede ao testar conexão");
    }
  }

  function validateDbStep(): boolean {
    const errs: Record<string, string> = {};
    if (db.provider !== "sqlite") {
      if (!db.host) errs.host = "Obrigatório";
      if (!db.database) errs.database = "Obrigatório";
      if (!db.username) errs.username = "Obrigatório";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goToStep2() {
    if (!validateDbStep()) return;
    if (testState !== "ok") {
      setTestError("Teste a conexão antes de continuar");
      return;
    }
    setStep(2);
  }

  // ── Admin form helpers ─────────────────────────────────────────────────────

  function validateAdmin(): boolean {
    const errs: Record<string, string> = {};
    if (!admin.username || admin.username.length < 3) errs.auser = "Mínimo 3 caracteres";
    if (!admin.password || admin.password.length < 8) errs.apass = "Mínimo 8 caracteres";
    if (admin.password !== admin.confirm) errs.aconfirm = "Senhas não coincidem";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleApply() {
    if (!validateAdmin()) return;
    setStep(3);
    setApplyLog(["Gravando configurações..."]);

    try {
      const res = await fetch("/api/setup/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...db, adminUsername: admin.username, adminPassword: admin.password }),
      });

      if (res.ok) {
        setApplyLog((l) => [
          ...l,
          "Gerando cliente Prisma...",
          "Aplicando schema no banco...",
          "Criando usuário administrador...",
          "Setup concluído!",
        ]);
        setApplyDone(true);
        setStep(4);
      } else {
        const data = await res.json() as { error?: string };
        setApplyError(data.error ?? "Erro desconhecido");
        setStep(3);
      }
    } catch {
      setApplyError("Servidor reiniciando — isso é esperado. Aguarde e recarregue a página.");
      setApplyDone(true);
      setStep(4);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const stepLabels = ["Banco de dados", "Administrador", "Aplicando", "Concluído"];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">

      {/* Brand */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M12 2.4V3.4"/><path d="M9.8 6 12 3.7l2.2 2.3"/>
            <path d="M10.4 6h3.2v2.5h-3.2z"/>
            <circle cx="12" cy="7.25" r="0.7" fill="currentColor" stroke="none"/>
            <path d="M9.8 7.25H8M14.2 7.25H16"/>
            <path d="M8.9 8.5h6.2"/>
            <path d="M9.8 8.5 8.5 19.6M14.2 8.5 15.5 19.6"/>
            <path d="M9.3 12.4h5.4"/><path d="M8.9 16h6.2"/>
            <path d="M7.3 19.6h9.4"/>
            <path d="M10.9 19.6v-2.3a1.1 1.1 0 0 1 2.2 0v2.3"/>
          </svg>
        </div>
        <div>
          <div className="font-bold text-lg tracking-tight text-foreground">WatchIT Tower</div>
          <div className="text-xs text-muted-foreground">Configuração inicial</div>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3 mb-8">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as Step;
          const done   = step > n;
          const active = step === n;
          return (
            <div key={n} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${
                active ? "text-primary" : done ? "text-success" : "text-muted-foreground"
              }`}>
                <StatusDot done={done} active={active} />
                {label}
              </div>
              {i < stepLabels.length - 1 && (
                <div className={`w-6 h-px ${done ? "bg-success" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 space-y-6">

        {/* ── Step 1: Database ── */}
        {step === 1 && (
          <>
            <div>
              <h1 className="text-xl font-bold text-foreground">Banco de dados</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Escolha onde o WatchIT Tower vai armazenar os dados.
              </p>
            </div>

            <div className="space-y-3">
              <ProviderCard value="sqlite"     current={db.provider} onClick={() => setProvider("sqlite")}
                label="SQLite" description="Arquivo local — ideal para instalação simples, sem Docker" />
              <ProviderCard value="mysql"      current={db.provider} onClick={() => setProvider("mysql")}
                label="MySQL / MariaDB" description="Servidor MySQL ou MariaDB existente" />
              <ProviderCard value="postgresql" current={db.provider} onClick={() => setProvider("postgresql")}
                label="PostgreSQL" description="Servidor PostgreSQL — recomendado para produção" />
            </div>

            {db.provider === "sqlite" ? (
              <Field label="Caminho do arquivo">
                <Input
                  value={db.sqlitePath}
                  onChange={(e) => updateDb("sqlitePath", e.target.value)}
                  placeholder="./data/watchit.db"
                />
              </Field>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="Host">
                      <Input value={db.host} onChange={(e) => updateDb("host", e.target.value)}
                        placeholder="localhost" />
                      {errors.host && <p className="text-xs text-destructive mt-1">{errors.host}</p>}
                    </Field>
                  </div>
                  <Field label="Porta">
                    <Input value={db.port} onChange={(e) => updateDb("port", e.target.value)}
                      placeholder={db.provider === "mysql" ? "3306" : "5432"} />
                  </Field>
                </div>
                <Field label="Nome do banco">
                  <Input value={db.database} onChange={(e) => updateDb("database", e.target.value)}
                    placeholder="watchit" />
                  {errors.database && <p className="text-xs text-destructive mt-1">{errors.database}</p>}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Usuário">
                    <Input value={db.username} onChange={(e) => updateDb("username", e.target.value)}
                      placeholder="watchit" />
                    {errors.username && <p className="text-xs text-destructive mt-1">{errors.username}</p>}
                  </Field>
                  <Field label="Senha">
                    <Input type="password" value={db.password}
                      onChange={(e) => updateDb("password", e.target.value)} placeholder="••••••••" />
                  </Field>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleTestDb}
                disabled={testState === "loading"}
                className="w-full py-2.5 rounded-lg border border-border bg-secondary text-sm font-semibold text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
              >
                {testState === "loading" ? "Testando..." : "Testar conexão"}
              </button>

              {testState === "ok" && (
                <p className="text-xs text-success font-medium text-center">
                  ✓ Conexão bem-sucedida
                </p>
              )}
              {(testState === "error" || testError) && (
                <p className="text-xs text-destructive text-center">{testError}</p>
              )}
            </div>

            <button
              type="button"
              onClick={goToStep2}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Continuar →
            </button>
          </>
        )}

        {/* ── Step 2: Admin user ── */}
        {step === 2 && (
          <>
            <div>
              <h1 className="text-xl font-bold text-foreground">Usuário administrador</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Crie a conta que terá acesso total ao sistema.
              </p>
            </div>

            <div className="space-y-4">
              <Field label="Nome de usuário">
                <Input
                  value={admin.username}
                  onChange={(e) => setAdmin((a) => ({ ...a, username: e.target.value }))}
                  placeholder="admin"
                  autoComplete="username"
                />
                {errors.auser && <p className="text-xs text-destructive mt-1">{errors.auser}</p>}
              </Field>
              <Field label="Senha">
                <Input
                  type="password"
                  value={admin.password}
                  onChange={(e) => setAdmin((a) => ({ ...a, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                />
                {errors.apass && <p className="text-xs text-destructive mt-1">{errors.apass}</p>}
              </Field>
              <Field label="Confirmar senha">
                <Input
                  type="password"
                  value={admin.confirm}
                  onChange={(e) => setAdmin((a) => ({ ...a, confirm: e.target.value }))}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
                {errors.aconfirm && <p className="text-xs text-destructive mt-1">{errors.aconfirm}</p>}
              </Field>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:border-primary/40 transition-colors"
              >
                ← Voltar
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Finalizar setup
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Applying ── */}
        {step === 3 && (
          <div className="space-y-6 text-center py-4">
            <div className="space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <h1 className="text-xl font-bold text-foreground">Aplicando configurações</h1>
              <p className="text-sm text-muted-foreground">Isso pode levar alguns segundos…</p>
            </div>

            {applyLog.length > 0 && (
              <div className="text-left space-y-1.5 bg-muted/50 rounded-lg p-4">
                {applyLog.map((line, i) => (
                  <p key={i} className="text-xs font-mono text-muted-foreground">
                    <span className="text-success mr-2">›</span>{line}
                  </p>
                ))}
              </div>
            )}

            {applyError && (
              <p className="text-xs text-destructive">{applyError}</p>
            )}
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div className="space-y-6 text-center py-4">
            <div className="space-y-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-success/10 flex items-center justify-center text-success text-2xl">
                ✓
              </div>
              <h1 className="text-xl font-bold text-foreground">Setup concluído!</h1>
              <p className="text-sm text-muted-foreground">
                O banco foi configurado e o usuário administrador foi criado.
              </p>
            </div>

            <div className="text-left bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground">Próximo passo:</p>
              <p className="text-xs text-muted-foreground">
                O servidor está reiniciando para carregar as novas configurações.
                Aguarde alguns segundos e clique em continuar.
              </p>
              <div className="mt-2 font-mono text-xs bg-background rounded px-3 py-2 text-primary select-all">
                npm run dev:all
              </div>
              <p className="text-xs text-muted-foreground">
                Em produção (PM2/systemd) o reinício é automático.
              </p>
            </div>

            <RestartButton />
          </div>
        )}

      </div>
    </div>
  );
}

// Polls /api/setup/status until complete, then redirects to /login
function RestartButton() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function handleClick() {
    setChecking(true);
    const start = Date.now();
    const timeout = 30_000;

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch("/api/setup/status");
        if (res.ok) {
          const data = await res.json() as { complete: boolean };
          if (data.complete) {
            router.push("/login");
            return;
          }
        }
      } catch {
        // server still restarting — keep polling
      }
    }

    // Timeout — redirect anyway, let the user see what happens
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={checking}
      className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {checking ? "Aguardando servidor reiniciar…" : "Continuar para o login →"}
    </button>
  );
}
