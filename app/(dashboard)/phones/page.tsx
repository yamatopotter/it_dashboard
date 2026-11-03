"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Phone } from "@prisma/client";
import type { PhonePaginatedResponse } from "@/app/api/phones/route";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Panel } from "@/components/tui/panel";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkChips, LnkEmpty, LnkError, LnkLoading, LnkToggle } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useListNav } from "@/hooks/use-list-nav";
import { fmtDate, formatCurrency } from "@/lib/format";

const PAGE_LIMIT = 25;

type StatusFilter = "ALL" | "ACTIVE" | "SUSPENDED" | "CANCELED";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Ativo", SUSPENDED: "Suspenso", CANCELED: "Cancelado" };
const STATUS_GLYPH: Record<string, "ok" | "warn" | "crit"> = { ACTIVE: "ok", SUSPENDED: "warn", CANCELED: "crit" };

const HELP: HelpRow[] = [
  ["j k", "selecionar celular (↓ ↑ também)"],
  ["⏎ / e", "editar o celular selecionado"],
  ["n", "novo celular"],
  ["d", "remover o celular selecionado"],
  ["1 2 3 4", "estado: todos / ativos / suspensos / cancelados"],
  ["f", "fidelidade vencendo em 30 dias"],
  ["m", "carregar mais"],
  ["/", "buscar nos carregados"],
  ["esc", "fechar busca ou ajuda"],
];

// A API devolve datas como string JSON; normaliza antes de comparar.
function loyaltyState(endDate: Date | string | null): "expired" | "expiring" | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  if (end < now) return "expired";
  if (end <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) return "expiring";
  return null;
}

export default function PhonesPage() {
  const router = useRouter();
  const [phones, setPhones] = useState<Phone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [expiringFilter, setExpiringFilter] = useState(false);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<Phone | null>(null);
  const [help, setHelp] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchPage = async (p: number, replace: boolean) => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_LIMIT));

      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (expiringFilter) params.set("expiringIn", "30");

      const res = await fetch(`/api/phones?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: PhonePaginatedResponse = await res.json();
      const newPhones = replace ? data.data : [...phones, ...(data.data || [])];
      setPhones(newPhones.filter((x) => x !== null) as Phone[]);
      setHasMore(data.page < Math.ceil(data.total / PAGE_LIMIT));
      setTotal(data.total);
      setPage(p);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error("[phones] erro ao carregar página:", err);
      if (replace) setError("Não foi possível carregar os celulares.");
      toast.error("Erro ao carregar celulares");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Recarrega ao trocar filtros: sincroniza com a API (sistema externo); o setState ocorre após o await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, expiringFilter]);

  const doDelete = async () => {
    const target = confirm;
    if (!target) return;
    try {
      const res = await fetch(`/api/phones/${target.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhones((prev) => prev.filter((p) => p.id !== target.id));
      toast.success("Celular removido");
    } catch {
      toast.error("Erro ao remover celular");
    } finally {
      setConfirm(null);
    }
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return phones;
    return phones.filter((p) => [p.phoneNumber, p.owner, p.department, p.carrier, p.model].some((v) => v?.toLowerCase().includes(needle)));
  }, [phones, q]);

  const nav = useListNav(shown.length);
  const selected = shown[nav.sel];

  const keys: HotkeyMap = {
    "?": () => setHelp((h) => !h),
    Escape: (e) => {
      if (help) return setHelp(false);
      const t = e.target as HTMLElement | null;
      if (t?.id === "lnk-q") { setQ(""); t.blur(); }
    },
  };
  if (!help && !confirm) {
    Object.assign(keys, nav.keys, {
      "/": () => document.getElementById("lnk-q")?.focus(),
      n: () => router.push("/phones/new"),
      e: () => selected && router.push(`/phones/${selected.id}/edit`),
      Enter: () => selected && router.push(`/phones/${selected.id}/edit`),
      d: () => selected && setConfirm(selected),
      "1": () => setStatusFilter("ALL"),
      "2": () => setStatusFilter("ACTIVE"),
      "3": () => setStatusFilter("SUSPENDED"),
      "4": () => setStatusFilter("CANCELED"),
      f: () => setExpiringFilter((v) => !v),
      m: () => { if (hasMore) void fetchPage(page + 1, false); },
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["j", "k"], label: "selecionar" },
    { keys: ["⏎"], label: "editar" },
    { keys: ["n"], label: "novo" },
    { keys: ["d"], label: "remover", hideSm: true },
    { keys: ["f"], label: "fidelidade", hideSm: true },
    ...(hasMore ? [{ keys: ["m"], label: "mais" }] : []),
    { keys: ["/"], label: "buscar", hideSm: true },
    { keys: ["?"], label: "ajuda" },
  ];

  return (
    <LnkShell
      title="CELULARES"
      sub={loading ? undefined : `${total} no inventário`}
      updatedAt={updatedAt}
      actions={
        <button type="button" className="btn primary" onClick={() => router.push("/phones/new")}>
          <kbd>n</kbd>novo celular
        </button>
      }
      hints={hints}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      <Panel title="inventário móvel" sub={loading ? undefined : `${shown.length} exibidos`} color="info">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <LnkChips<StatusFilter>
            label="Filtro de estado"
            value={statusFilter}
            onChange={setStatusFilter}
            chips={[
              { value: "ALL", label: "todos", key: "1" },
              { value: "ACTIVE", label: "ativos", key: "2" },
              { value: "SUSPENDED", label: "suspensos", key: "3" },
              { value: "CANCELED", label: "cancelados", key: "4" },
            ]}
          />
          <LnkToggle label="fidelidade vencendo" on={expiringFilter} onToggle={() => setExpiringFilter((v) => !v)} k="f" />
          <span className="spacer" />
          <input id="lnk-q" className="search" type="search" placeholder="/ buscar número, pessoa, operadora" aria-label="Buscar celular" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? (
          <LnkLoading what="celulares" />
        ) : error && phones.length === 0 ? (
          <LnkError message={error} onRetry={() => fetchPage(1, true)} />
        ) : shown.length === 0 ? (
          phones.length === 0 ? (
            <LnkEmpty
              title="Nenhum celular cadastrado"
              hint="Comece adicionando um novo celular ao inventário."
              action={<button type="button" className="btn primary" onClick={() => router.push("/phones/new")}>novo celular</button>}
            />
          ) : (
            <LnkEmpty title="Nenhum celular encontrado para a busca." />
          )
        ) : (
          <div className="tblwrap">
            <table className="tbl" aria-label="Celulares">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Estado</span></th>
                  <th scope="col">Linha</th>
                  <th scope="col" className="hide-md">Departamento / operadora</th>
                  <th scope="col" className="r hide-md">Fatura</th>
                  <th scope="col">Fidelidade</th>
                  <th scope="col" className="r hide-md">Bateria</th>
                  <th scope="col" className="r"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((phone, i) => {
                  const loyalty = loyaltyState(phone.loyaltyEndDate);
                  const battery = phone.miradoreBatteryLevel;
                  return (
                    <tr
                      key={phone.id}
                      className={i === nav.sel ? "sel" : undefined}
                      data-sel={i === nav.sel ? "true" : undefined}
                      aria-current={i === nav.sel ? "true" : undefined}
                      onClick={() => nav.setSel(i)}
                      onDoubleClick={() => router.push(`/phones/${phone.id}/edit`)}
                    >
                      <td className="keep" style={{ width: "3ch" }}>
                        <StateGlyph state={STATUS_GLYPH[phone.status] ?? "unk"} label={STATUS_LABEL[phone.status] ?? phone.status} />
                      </td>
                      <td>
                        <span className="nm">{phone.phoneNumber}</span>
                        <span className="sm">{phone.owner} · {STATUS_LABEL[phone.status] ?? phone.status}</span>
                      </td>
                      <td className="hide-md">
                        {[phone.department, phone.carrier].filter(Boolean).join(" · ") || <span className="dim">—</span>}
                      </td>
                      <td className="r hide-md">{phone.invoiceAmountCents ? formatCurrency(phone.invoiceAmountCents / 100) : <span className="dim">—</span>}</td>
                      <td>
                        {phone.loyaltyEndDate ? (
                          <>
                            {loyalty === "expired" && <span className="crit">✖ vencida </span>}
                            {loyalty === "expiring" && <span className="warn">▲ vencendo </span>}
                            <span className="dim">{fmtDate(phone.loyaltyEndDate)}</span>
                          </>
                        ) : <span className="dim">—</span>}
                      </td>
                      <td className={`r hide-md${battery != null && battery < 20 ? " crit" : battery != null && battery < 40 ? " warn" : ""}`}>
                        {battery != null ? `${battery}%` : <span className="dim">—</span>}
                      </td>
                      <td className="acts" onClick={(e) => e.stopPropagation()}>
                        <span className="btns" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <button type="button" className="btn" onClick={() => router.push(`/phones/${phone.id}/edit`)} aria-label={`Editar ${phone.phoneNumber}`}>editar</button>
                          <button type="button" className="btn danger" onClick={() => setConfirm(phone)} aria-label={`Remover ${phone.phoneNumber}`}>remover</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !loading && (
          <div className="btns" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => fetchPage(page + 1, false)}>
              <kbd>m</kbd>carregar mais
            </button>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={`Remover celular ${confirm?.phoneNumber ?? ""}?`}
        description="Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        onConfirm={doDelete}
      />
    </LnkShell>
  );
}
