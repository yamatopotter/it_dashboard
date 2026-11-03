"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { LayoutDashboard, Server, Network, LogOut, AlertCircle, FileText, RadioTower, Wifi, Router, Users, Settings, ClipboardList, Smartphone, Monitor, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LighthouseIcon } from "@/components/lighthouse-icon";
import type { ModuleFlags } from "@/lib/modules";

interface SidebarCounts {
  devicesTotal: number;
  devicesOffline: number;
  linksOnline: number;
  linksTotal: number;
  phonesTotal?: number;
  phonesLoyaltyExpiring?: number;
  computersTotal?: number;
  computersOffline?: number;
}

function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="tui-side-sec">{children}</div>;
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  alertBadge,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  badge?: string | number;
  alertBadge?: number;
}) {
  const alert = alertBadge != null && alertBadge > 0;
  return (
    <Link href={href} className="tui-side-link" aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" />
      {label}
      {alert ? (
        <span className="tui-side-n crit" title={`${alertBadge} com problema`}>
          <span aria-hidden="true">✖ </span>
          {alertBadge}
        </span>
      ) : badge != null ? (
        <span className="tui-side-n">{badge}</span>
      ) : null}
    </Link>
  );
}

const ROLE_LABEL: Record<string, string> = { ADMIN: "administrador", OPERADOR: "operador", VIEWER: "visualizador" };

export function Sidebar({
  userName = "Usuário",
  userRole = "VIEWER",
  initialCounts,
  modules = { telephony: false, computers: false, nvr: false },
}: {
  userName?: string;
  userRole?: string;
  initialCounts?: SidebarCounts;
  modules?: ModuleFlags;
}) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<SidebarCounts>(
    initialCounts ?? { devicesTotal: 0, devicesOffline: 0, linksOnline: 0, linksTotal: 0, phonesTotal: 0, phonesLoyaltyExpiring: 0, computersTotal: 0, computersOffline: 0 }
  );
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/version")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.build) setVersion(`v${d.version} · build ${d.build}`); })
      .catch(() => {});
  }, []);

  // Mantém os contadores vivos (initialCounts do SSR congelaria).
  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetch("/api/counts")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (active && d) setCounts(d); })
        .catch(() => {});
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Esc fecha o menu no mobile.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="tui-icon-btn tui-side-toggle"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
      </button>
      <div className="tui-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside aria-label="Menu lateral" className="tui-side" data-open={open}>
        <div className="tui-side-brand">
          <LighthouseIcon size={20} />
          <div>
            <b>WatchIT Tower</b>
            <small>monitoramento</small>
          </div>
        </div>

        <nav aria-label="Menu principal" className="flex flex-col flex-1" onClick={() => setOpen(false)}>
          <NavSectionLabel>Monitoramento</NavSectionLabel>

          <NavItem href="/" label="Painel" icon={LayoutDashboard} active={pathname === "/"} />

          <NavItem
            href="/devices"
            label="Dispositivos"
            icon={Server}
            active={pathname.startsWith("/devices")}
            badge={counts.devicesTotal > 0 ? counts.devicesTotal : undefined}
            alertBadge={counts.devicesOffline}
          />

          <NavItem
            href="/links"
            label="Links de Internet"
            icon={Network}
            active={pathname.startsWith("/links")}
            badge={counts.linksTotal > 0 ? `${counts.linksOnline}/${counts.linksTotal}` : undefined}
          />

          <NavItem
            href="/incidents"
            label="Incidentes"
            icon={AlertCircle}
            active={pathname.startsWith("/incidents")}
            alertBadge={counts.devicesOffline}
          />

          {modules.telephony && (
            <NavItem
              href="/phones"
              label="Celulares"
              icon={Smartphone}
              active={pathname.startsWith("/phones")}
              badge={counts.phonesTotal ? counts.phonesTotal : undefined}
              alertBadge={counts.phonesLoyaltyExpiring}
            />
          )}

          {modules.computers && (
            <NavItem
              href="/computers"
              label="Computadores"
              icon={Monitor}
              active={pathname.startsWith("/computers")}
              badge={counts.computersTotal ? counts.computersTotal : undefined}
              alertBadge={counts.computersOffline}
            />
          )}

          <NavItem href="/overview" label="Visão antiga" icon={LayoutDashboard} active={pathname.startsWith("/overview")} />

          <NavSectionLabel>Painéis</NavSectionLabel>
          <NavItem href="/mikrotik" label="Mikrotik" icon={Router} active={pathname.startsWith("/mikrotik")} />
          <NavItem href="/omada" label="Omada" icon={RadioTower} active={pathname.startsWith("/omada")} />
          <NavItem href="/unifi" label="UniFi" icon={Wifi} active={pathname.startsWith("/unifi")} />

          <NavSectionLabel>Sistema</NavSectionLabel>
          <NavItem href="/reports" label="Relatórios" icon={FileText} active={pathname.startsWith("/reports")} />

          {userRole === "ADMIN" && (
            <>
              <NavSectionLabel>Administração</NavSectionLabel>
              <NavItem href="/users" label="Usuários" icon={Users} active={pathname.startsWith("/users")} />
              <NavItem href="/system" label="Sistema" icon={Settings} active={pathname.startsWith("/system")} />
              <NavItem href="/audit" label="Logs de Alterações" icon={ClipboardList} active={pathname.startsWith("/audit")} />
            </>
          )}
        </nav>

        <div className="tui-side-user">
          <Link href="/profile" aria-label="Minha conta">
            <div className="truncate font-semibold">{userName}</div>
            <div className="text-[11px] text-muted-foreground">{ROLE_LABEL[userRole] ?? "visualizador"}</div>
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={async () => {
              // SEC-021: blacklist the JWT before signing out
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
              await signOut({ callbackUrl: "/login" });
            }}
            className="tui-icon-btn"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {version && (
          <div className="pt-2 text-[11px] text-muted-foreground select-none">
            <Link href="/changelog" className="hover:text-foreground">{version}</Link>
          </div>
        )}
      </aside>
    </>
  );
}
