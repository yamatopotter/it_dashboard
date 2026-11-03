"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LighthouseIcon } from "@/components/lighthouse-icon";
import { Panel } from "@/components/tui/panel";
import { Field } from "@/components/tui/states";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // SEC-009: track whether this user has TOTP enabled
  const [needsTotp, setNeedsTotp] = useState(false);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .then(setProviders)
      .catch(() => setProviders({}));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // SEC-009: if TOTP step not yet revealed, check if user has 2FA enabled
      if (!needsTotp) {
        const check = await fetch(
          `/api/auth/check-2fa?username=${encodeURIComponent(username)}`
        ).then((r) => r.json() as Promise<{ totpEnabled: boolean }>);

        if (check.totpEnabled) {
          // Show TOTP field — don't sign in yet
          setNeedsTotp(true);
          setLoading(false);
          return;
        }
      }

      const result = await signIn("credentials", {
        username,
        password,
        totp: needsTotp ? totp : "",
        redirect: false,
      });

      if (result?.error) {
        if (needsTotp) {
          setError("Código 2FA inválido ou expirado");
        } else {
          setError("Usuário ou senha inválidos");
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Erro ao conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tui-auth">
      <div className="tui-auth-box tui">
        <div className="tui-side-brand" style={{ justifyContent: "center", paddingBottom: 18 }}>
          <LighthouseIcon size={28} />
          <div>
            <b style={{ fontSize: 15 }}>WatchIT Tower</b>
            <small>monitoramento de TI · acesso restrito</small>
          </div>
        </div>

        <Panel title={needsTotp ? "verificação em duas etapas" : "entrar"} color="accent2">
          <p className="tui-hint" style={{ marginBottom: 12 }}>
            {needsTotp ? "Digite o código do seu app autenticador." : "Credenciais fornecidas pelo administrador."}
          </p>
          <form onSubmit={handleSubmit} className="tui-form">
            {!needsTotp && (
              <>
                <Field id="username" label="Usuário">
                  <input
                    id="username"
                    className="tui-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="seu usuário"
                    required
                    autoFocus
                    autoComplete="username"
                  />
                </Field>
                <Field id="password" label="Senha">
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      id="password"
                      className="tui-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="tui-btn"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? "ocultar" : "ver"}
                    </button>
                  </div>
                </Field>
              </>
            )}

            {/* SEC-009: TOTP step */}
            {needsTotp && (
              <Field id="totp" label="Código 2FA">
                <input
                  id="totp"
                  className="tui-input"
                  style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 18 }}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  autoFocus
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  className="tui-btn tui-btn-sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => { setNeedsTotp(false); setTotp(""); setError(""); }}
                >
                  ← voltar ao login
                </button>
              </Field>
            )}

            {error && (
              <div className="tui-error" role="alert">
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="tui-btn tui-btn-primary" style={{ minHeight: 34 }} disabled={loading}>
              {loading ? "Verificando..." : needsTotp ? "Verificar código" : "Entrar"}
            </button>
          </form>

          {Boolean(providers?.zoho) && !needsTotp && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <button type="button" className="tui-btn" style={{ width: "100%", minHeight: 32 }} onClick={() => signIn("zoho", { callbackUrl: "/" })}>
                Entrar com Zoho
              </button>
            </div>
          )}
        </Panel>
        <p className="tui-hint" style={{ textAlign: "center", marginTop: 16 }}>uso exclusivo interno</p>
      </div>
    </main>
  );
}
