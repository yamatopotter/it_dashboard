"use client";

import { useState, useEffect, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { Panel } from "@/components/tui/panel";
import { TuiPage } from "@/components/tui/page";
import { EmptyBox, SkeletonRows, StatusBadge } from "@/components/tui/states";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, Plus, Key, Trash2, ShieldCheck, Eye, Wrench, KeyRound, ShieldOff } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

type UserRole = "ADMIN" | "OPERADOR" | "VIEWER";
type AuthProvider = "LOCAL" | "ZOHO";

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  authProvider: AuthProvider;
  role: UserRole;
  totpEnabled: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN:    "Admin",
  OPERADOR: "Operador",
  VIEWER:   "Viewer",
};

const ROLE_ICON: Record<UserRole, React.ElementType> = {
  ADMIN:    ShieldCheck,
  OPERADOR: Wrench,
  VIEWER:   Eye,
};

const ROLE_VARIANT: Record<UserRole, "default" | "secondary" | "outline"> = {
  ADMIN:    "default",
  OPERADOR: "secondary",
  VIEWER:   "outline",
};

export default function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createAuthProvider, setCreateAuthProvider] = useState<AuthProvider>("LOCAL");
  const [createUsername, setCreateUsername] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<UserRole>("VIEWER");
  const [creating, setCreating] = useState(false);

  // Edit password dialog
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("VIEWER");
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Manage 2FA dialog
  const [manage2FAUser, setManage2FAUser] = useState<UserRow | null>(null);
  const [totpStep, setTotpStep] = useState<"idle" | "setup-loading" | "setup" | "setup-verifying" | "disable" | "disable-verifying">("idle");
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [totpToken, setTotpToken] = useState("");
  const [totpCopied, setTotpCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/users", { cache: "no-store" });
    if (res.ok) setUsers(await res.json());
    else if (res.status === 403) toast.error("Acesso negado — somente admins podem gerenciar usuários");
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/users", { cache: "no-store" }).then(async (res) => {
      if (!alive) return;
      if (res.ok) setUsers(await res.json());
      else if (res.status === 403) toast.error("Acesso negado — somente admins podem gerenciar usuários");
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const payload = createAuthProvider === "LOCAL"
        ? { authProvider: "LOCAL", username: createUsername, password: createPassword, role: createRole }
        : { authProvider: "ZOHO", email: createEmail, role: createRole };

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Usuário criado com sucesso");
        setShowCreate(false);
        setCreateAuthProvider("LOCAL");
        setCreateUsername("");
        setCreateEmail("");
        setCreatePassword("");
        setCreateRole("VIEWER");
        await load();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Erro ao criar usuário");
      }
    } catch {
      toast.error("Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { role: editRole };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Usuário atualizado");
        setEditUser(null);
        setEditPassword("");
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erro ao salvar");
      }
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`Usuário "${deleteUser.username}" removido`);
        setDeleteUser(null);
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Erro ao excluir");
      }
    } catch {
      toast.error("Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEditRole(u.role);
    setEditPassword("");
  }

  function open2FA(u: UserRow) {
    setManage2FAUser(u);
    setTotpStep("idle");
    setTotpSetupData(null);
    setTotpToken("");
  }

  function close2FA() {
    setManage2FAUser(null);
    setTotpStep("idle");
    setTotpSetupData(null);
    setTotpToken("");
  }

  async function startTotpSetup() {
    if (!manage2FAUser) return;
    setTotpStep("setup-loading");
    try {
      const res = await fetch(`/api/users/${manage2FAUser.id}/totp`);
      if (!res.ok) { toast.error("Erro ao gerar QR code"); setTotpStep("idle"); return; }
      const data = await res.json();
      setTotpSetupData(data);
      setTotpStep("setup");
    } catch {
      toast.error("Erro ao gerar QR code");
      setTotpStep("idle");
    }
  }

  async function confirmTotpEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!manage2FAUser || !totpSetupData) return;
    setTotpStep("setup-verifying");
    try {
      const res = await fetch(`/api/users/${manage2FAUser.id}/totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: totpToken.replace(/\D/g, ""), secret: totpSetupData.secret }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Token inválido"); setTotpStep("setup"); return; }
      toast.success(`2FA ativado para ${manage2FAUser.username}`);
      close2FA();
      await load();
    } catch {
      toast.error("Erro ao ativar 2FA");
      setTotpStep("setup");
    }
  }

  async function confirmTotpDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!manage2FAUser) return;
    setTotpStep("disable-verifying");
    try {
      const res = await fetch(`/api/users/${manage2FAUser.id}/totp`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: totpToken.replace(/\D/g, "") }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Token inválido"); setTotpStep("disable"); return; }
      toast.success(`2FA desativado para ${manage2FAUser.username}`);
      close2FA();
      await load();
    } catch {
      toast.error("Erro ao desativar 2FA");
      setTotpStep("disable");
    }
  }

  async function copyTotpSecret() {
    if (!totpSetupData) return;
    await navigator.clipboard.writeText(totpSetupData.secret);
    setTotpCopied(true);
    setTimeout(() => setTotpCopied(false), 2000);
  }

  return (
    <>
      <Topbar title="Usuários" subtitle="Gerenciamento de acesso" icon={Users}>
        <button type="button" className="tui-btn tui-btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />Novo usuário
        </button>
      </Topbar>

      <TuiPage narrow>
        <Panel title="usuários" sub={loading ? undefined : `${users.length}`} color="accent2">
          {loading ? (
            <SkeletonRows rows={3} />
          ) : users.length === 0 ? (
            <EmptyBox title="Nenhum usuário encontrado." />
          ) : (
            <div className="tui-table-wrap">
              <table className="tui-table" aria-label="Lista de usuários">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Função</th>
                    <th>2FA</th>
                    <th>Criado em</th>
                    <th><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const Icon = ROLE_ICON[u.role];
                    return (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600 }}>{u.username}</td>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <Badge variant={ROLE_VARIANT[u.role]} className="gap-1.5">
                              <Icon className="h-3 w-3" aria-hidden="true" />
                              {ROLE_LABEL[u.role]}
                            </Badge>
                            <Badge variant="outline">{u.authProvider === "LOCAL" ? "Local" : "Zoho"}</Badge>
                          </span>
                        </td>
                        <td>
                          {u.authProvider === "ZOHO" ? (
                            <span className="tui-dim">—</span>
                          ) : u.totpEnabled ? (
                            <StatusBadge level="ok">2FA ativo</StatusBadge>
                          ) : (
                            <StatusBadge level="dim">2FA inativo</StatusBadge>
                          )}
                        </td>
                        <td className="tui-dim">
                          {fmtDate(u.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </td>
                        <td>
                          <div className="tui-btns" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            <button type="button" className="tui-btn tui-btn-sm" onClick={() => openEdit(u)}>
                              <Key className="h-3 w-3" aria-hidden="true" />Editar
                            </button>
                            {u.authProvider === "LOCAL" && (
                              <button type="button" className="tui-btn tui-btn-sm" aria-label={`Gerenciar 2FA de ${u.username}`} onClick={() => open2FA(u)}>
                                <KeyRound className="h-3 w-3" aria-hidden="true" />2FA
                              </button>
                            )}
                            <button type="button" className="tui-btn tui-btn-sm tui-btn-danger" aria-label={`Remover usuário ${u.username}`} onClick={() => setDeleteUser(u)}>
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </TuiPage>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo de autenticação</Label>
              <div className="flex gap-2">
                {(["LOCAL", "ZOHO"] as AuthProvider[]).map((auth) => (
                  <button key={auth} type="button"
                    onClick={() => setCreateAuthProvider(auth)}
                    className={`flex-1 rounded-lg border p-2.5 text-xs font-semibold transition-colors ${
                      createAuthProvider === auth
                        ? "border-primary bg-[var(--accent-2)]/5 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}>
                    {auth === "LOCAL" ? "Local" : "Zoho (SSO)"}
                  </button>
                ))}
              </div>
            </div>

            {createAuthProvider === "LOCAL" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="new-username">Nome de usuário</Label>
                  <Input id="new-username" value={createUsername} onChange={e => setCreateUsername(e.target.value)}
                    placeholder="ex: joao.silva" required minLength={3} maxLength={32} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Senha</Label>
                  <Input id="new-password" type="password" value={createPassword} onChange={e => setCreatePassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres" required minLength={8} />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="new-email">E-mail corporativo</Label>
                <Input id="new-email" type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                  placeholder="usuario@empresa.com" required />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Função</Label>
              <div className="flex gap-2">
                {(["ADMIN", "OPERADOR", "VIEWER"] as UserRole[]).map((r) => {
                  const Icon = ROLE_ICON[r];
                  return (
                    <button key={r} type="button"
                      onClick={() => setCreateRole(r)}
                      className={`flex-1 flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-semibold transition-colors ${
                        createRole === r
                          ? "border-primary bg-[var(--accent-2)]/5 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      }`}>
                      <Icon className="h-4 w-4" />
                      {ROLE_LABEL[r]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {createRole === "ADMIN" && "Acesso total, incluindo gerenciamento de usuários."}
                {createRole === "OPERADOR" && "Pode criar, editar e excluir dispositivos e links. Sem acesso a usuários."}
                {createRole === "VIEWER" && "Somente leitura. Não pode criar nem modificar nada."}
              </p>
            </div>
            <DialogFooter>
              <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
              <Button type="submit" disabled={creating}>{creating ? "Criando..." : "Criar usuário"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário — {editUser?.username}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {editUser?.authProvider === "ZOHO" && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs font-semibold text-blue-900">
                  Login via Zoho SSO — sem senha local
                </p>
              </div>
            )}

            {editUser?.authProvider === "LOCAL" && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-password">Nova senha <span className="text-muted-foreground">(deixe em branco para não alterar)</span></Label>
                <Input id="edit-password" type="password" value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres" minLength={editPassword ? 8 : undefined} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Função</Label>
              <div className="flex gap-2">
                {(["ADMIN", "OPERADOR", "VIEWER"] as UserRole[]).map((r) => {
                  const Icon = ROLE_ICON[r];
                  return (
                    <button key={r} type="button"
                      onClick={() => setEditRole(r)}
                      className={`flex-1 flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-semibold transition-colors ${
                        editRole === r
                          ? "border-primary bg-[var(--accent-2)]/5 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                      }`}>
                      <Icon className="h-4 w-4" />
                      {ROLE_LABEL[r]}
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <DialogClose className={buttonVariants({ variant: "outline" })}>Cancelar</DialogClose>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2FA management dialog */}
      <Dialog open={!!manage2FAUser} onOpenChange={(o) => !o && close2FA()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Gerenciar 2FA — {manage2FAUser?.username}
            </DialogTitle>
          </DialogHeader>

          {manage2FAUser && (
            <div className="space-y-4">
              {/* Status */}
              <div className={`flex items-center gap-3 rounded-xl p-3.5 border ${manage2FAUser.totpEnabled ? "bg-success/5 border-success/20" : "bg-muted/40 border-border/60"}`}>
                {manage2FAUser.totpEnabled
                  ? <ShieldCheck className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                  : <ShieldOff className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                }
                <p className={`text-sm font-semibold ${manage2FAUser.totpEnabled ? "text-success" : "text-muted-foreground"}`}>
                  2FA {manage2FAUser.totpEnabled ? "ativado" : "desativado"}
                </p>
              </div>

              {/* Idle — action buttons */}
              {totpStep === "idle" && (
                <div className="flex gap-2">
                  {!manage2FAUser.totpEnabled ? (
                    <Button className="flex-1" onClick={startTotpSetup}>
                      <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />Ativar 2FA
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setTotpStep("disable"); setTotpToken(""); }}>
                      <ShieldOff className="h-4 w-4 mr-1.5" aria-hidden="true" />Desativar 2FA
                    </Button>
                  )}
                </div>
              )}

              {/* Setup: QR + verification */}
              {(totpStep === "setup" || totpStep === "setup-verifying") && totpSetupData && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    O usuário deve escanear o QR code abaixo com um app autenticador e confirmar com o código gerado.
                  </p>
                  <div className="flex justify-center">
                    <div className="p-3 bg-white rounded-xl border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={totpSetupData.qrDataUrl} alt="QR code para configurar o autenticador" width={140} height={140} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-[12px] bg-muted px-3 py-2 rounded-lg border border-border text-[var(--accent-2)] truncate">
                      {totpSetupData.secret}
                    </code>
                    <button onClick={copyTotpSecret} aria-label="Copiar chave secreta"
                      className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground shrink-0">
                      {totpCopied
                        ? <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                        : <KeyRound className="h-4 w-4" aria-hidden="true" />
                      }
                    </button>
                  </div>
                  <form onSubmit={confirmTotpEnable} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-totp-enable">Código de confirmação (6 dígitos)</Label>
                      <Input id="admin-totp-enable" value={totpToken}
                        onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000 000" maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                        className="font-mono text-lg tracking-[.3em] text-center" required />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setTotpStep("idle")} disabled={totpStep === "setup-verifying"}>Cancelar</Button>
                      <Button type="submit" disabled={totpToken.length !== 6 || totpStep === "setup-verifying"}>
                        {totpStep === "setup-verifying" ? "Verificando..." : "Confirmar e ativar"}
                      </Button>
                    </DialogFooter>
                  </form>
                </div>
              )}

              {/* Disable: token verification */}
              {(totpStep === "disable" || totpStep === "disable-verifying") && (
                <form onSubmit={confirmTotpDisable} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-totp-disable">Código atual do autenticador</Label>
                    <Input id="admin-totp-disable" value={totpToken}
                      onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000 000" maxLength={6} inputMode="numeric" autoComplete="one-time-code"
                      className="font-mono text-lg tracking-[.3em] text-center" required autoFocus />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setTotpStep("idle")} disabled={totpStep === "disable-verifying"}>Cancelar</Button>
                    <Button type="submit" variant="destructive" disabled={totpToken.length !== 6 || totpStep === "disable-verifying"}>
                      {totpStep === "disable-verifying" ? "Desativando..." : "Desativar 2FA"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{deleteUser?.username}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
