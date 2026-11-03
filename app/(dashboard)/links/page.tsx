"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { usePolling } from "@/hooks/use-polling";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useListNav } from "@/hooks/use-list-nav";
import { LinkDetailDrawer } from "@/components/link-detail-drawer";
import { BandwidthCell } from "@/components/bandwidth-cell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Panel } from "@/components/tui/panel";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkChips, LnkEmpty, LnkError, LnkField, LnkLoading } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { formatBps, timeAgo } from "@/lib/format";
import { SITE_KEYS, SITE_NAMES } from "@/lib/modules";

interface LinkItem {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  site: string | null;
  isOnline: boolean;
  lastEventAt: string | null;
  createdAt: string;
  downloadBps: number | null;
  uploadBps: number | null;
  contractedDownloadBps: number | null;
  contractedUploadBps: number | null;
  mikrotikDeviceId: string | null;
  mikrotikInterface: string | null;
  webhookToken: string;
  _count: { events: number };
}

interface MikrotikDevice {
  id: string;
  name: string;
  ip: string;
}

const formSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  description: z.string().max(500).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  site: z.string().optional().nullable(),
  mikrotikDeviceId: z.string().optional().nullable(),
  mikrotikInterface: z.string().max(50).optional().nullable(),
  contractedDownloadMbps: z.number().positive("Deve ser maior que 0").optional().nullable(),
  contractedUploadMbps: z.number().positive("Deve ser maior que 0").optional().nullable(),
});
type FormValues = z.infer<typeof formSchema>;

type TrafficTest =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "ok"; downloadBps: number; uploadBps: number }
  | { state: "error"; message: string };

type StatusFilter = "ALL" | "ONLINE" | "OFFLINE";

const EMPTY_FORM: FormValues = { name: "", description: "", location: "", site: "", mikrotikDeviceId: "", mikrotikInterface: "", contractedDownloadMbps: null, contractedUploadMbps: null };

const HELP: HelpRow[] = [
  ["j k", "selecionar link (↓ ↑ também)"],
  ["⏎", "abrir painel do link"],
  ["o", "abrir página de histórico do link"],
  ["n", "novo link"],
  ["e", "editar o link selecionado"],
  ["d", "excluir o link selecionado"],
  ["1 2 3", "filtro: todos / online / offline"],
  ["/", "buscar"],
  ["esc", "fechar formulário, busca ou ajuda"],
];

async function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback para HTTP/contextos sem Clipboard API
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`URL ${label} copiada`);
    } catch {
      toast.error("Não foi possível copiar a URL");
    }
  }
  return (
    <button type="button" className="btn" onClick={copy} title={`Copiar URL do webhook ${label}`} aria-label={`Copiar URL do webhook ${label}`}>
      {copied ? "✓" : "⧉"} {label}
    </button>
  );
}

export default function LinksPage() {
  const router = useRouter();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [mikrotiks, setMikrotiks] = useState<MikrotikDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LinkItem | null>(null);
  const [drawerLinkId, setDrawerLinkId] = useState<string | null>(null);
  const [trafficTest, setTrafficTest] = useState<TrafficTest>({ state: "idle" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [help, setHelp] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY_FORM });

  // Só usado em linhas renderizadas depois do fetch (cliente), sem divergência de hidratação.
  const origin = globalThis.window?.location.origin ?? "";

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLinks(await res.json());
      setError(null);
    } catch {
      setError("Não foi possível carregar os links.");
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  usePolling(fetchLinks, 30_000);

  useEffect(() => {
    fetch("/api/devices?type=MIKROTIK")
      .then((r) => r.json())
      .then(setMikrotiks)
      .catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setTrafficTest({ state: "idle" });
    form.reset(EMPTY_FORM);
    setFormOpen(true);
    setTimeout(() => document.getElementById("name")?.focus(), 0);
  }

  function openEdit(link: LinkItem) {
    setEditing(link);
    setTrafficTest({ state: "idle" });
    form.reset({
      name: link.name,
      description: link.description ?? "",
      location: link.location ?? "",
      site: link.site ?? "",
      mikrotikDeviceId: link.mikrotikDeviceId ?? "",
      mikrotikInterface: link.mikrotikInterface ?? "",
      contractedDownloadMbps: link.contractedDownloadBps != null ? link.contractedDownloadBps / 1_000_000 : null,
      contractedUploadMbps: link.contractedUploadBps != null ? link.contractedUploadBps / 1_000_000 : null,
    });
    setFormOpen(true);
    setTimeout(() => document.getElementById("name")?.focus(), 0);
  }

  async function testTraffic(deviceId?: string, iface?: string): Promise<TrafficTest> {
    const mikrotikDeviceId = deviceId ?? form.getValues("mikrotikDeviceId");
    const mikrotikInterface = iface ?? form.getValues("mikrotikInterface");
    if (!mikrotikDeviceId || !mikrotikInterface) {
      const result: TrafficTest = { state: "error", message: "Selecione o Mikrotik e informe a interface antes de testar." };
      setTrafficTest(result);
      return result;
    }
    setTrafficTest({ state: "testing" });
    try {
      const res = await fetch("/api/links/test-traffic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mikrotikDeviceId, mikrotikInterface }),
      });
      const data = await res.json();
      const result: TrafficTest = res.ok
        ? { state: "ok", downloadBps: data.downloadBps, uploadBps: data.uploadBps }
        : { state: "error", message: data.error ?? "Erro desconhecido" };
      setTrafficTest(result);
      return result;
    } catch {
      const result: TrafficTest = { state: "error", message: "Erro de rede ao testar conexão" };
      setTrafficTest(result);
      return result;
    }
  }

  async function onSubmit(values: FormValues) {
    // Com RouterOS configurado, exige um teste bem-sucedido antes de salvar
    if (values.mikrotikDeviceId && values.mikrotikInterface) {
      if (trafficTest.state !== "ok") {
        const result = await testTraffic(values.mikrotikDeviceId, values.mikrotikInterface);
        if (result.state !== "ok") return; // bloqueia o salvamento; o erro já aparece no formulário
      }
    }

    try {
      const url = editing ? `/api/links/${editing.id}` : "/api/links";
      const method = editing ? "PUT" : "POST";
      const { contractedDownloadMbps, contractedUploadMbps, ...rest } = values;
      const toValidBps = (v: number | null | undefined) => (v != null && !isNaN(v) && v > 0 ? Math.round(v * 1_000_000) : null);
      const payload = {
        ...rest,
        contractedDownloadBps: toValidBps(contractedDownloadMbps),
        contractedUploadBps: toValidBps(contractedUploadMbps),
      };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Link atualizado" : "Link criado");
      setFormOpen(false);
      fetchLinks();
    } catch {
      toast.error("Erro ao salvar link");
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    try {
      const res = await fetch(`/api/links/${confirmDeleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Link excluído");
      await fetchLinks();
    } catch {
      toast.error("Erro ao excluir");
    } finally {
      setConfirmDeleteId(null);
    }
  }

  const online = links.filter((l) => l.isOnline).length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return links.filter((l) => {
      if (statusFilter === "ONLINE" && !l.isOnline) return false;
      if (statusFilter === "OFFLINE" && l.isOnline) return false;
      if (!needle) return true;
      return [l.name, l.description, l.location, l.site].some((v) => v?.toLowerCase().includes(needle));
    });
  }, [links, statusFilter, q]);

  const nav = useListNav(filtered.length);
  const selected: LinkItem | undefined = filtered[nav.sel];
  const busy = formOpen || confirmDeleteId !== null || drawerLinkId !== null;

  const keys: HotkeyMap = {
    "?": () => setHelp((h) => !h),
    Escape: (e) => {
      if (help) return setHelp(false);
      const t = e.target as HTMLElement | null;
      if (t?.id === "lnk-q") {
        setQ("");
        t.blur();
        return;
      }
      if (formOpen && !drawerLinkId && confirmDeleteId === null) setFormOpen(false);
    },
  };
  if (!help && !busy) {
    Object.assign(keys, nav.keys, {
      "/": () => document.getElementById("lnk-q")?.focus(),
      n: openCreate,
      e: () => selected && openEdit(selected),
      d: () => selected && setConfirmDeleteId(selected.id),
      o: () => selected && router.push(`/links/${selected.id}`),
      Enter: () => selected && setDrawerLinkId(selected.id),
      "1": () => setStatusFilter("ALL"),
      "2": () => setStatusFilter("ONLINE"),
      "3": () => setStatusFilter("OFFLINE"),
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["j", "k"], label: "selecionar" },
    { keys: ["⏎"], label: "painel" },
    { keys: ["n"], label: "novo" },
    { keys: ["e"], label: "editar" },
    { keys: ["d"], label: "excluir", hideSm: true },
    { keys: ["/"], label: "buscar", hideSm: true },
    { keys: ["?"], label: "ajuda" },
  ];

  const errors = form.formState.errors;
  const testing = trafficTest.state === "testing";

  return (
    <LnkShell
      title="LINKS"
      sub={loading ? undefined : `${online}/${links.length} online`}
      updatedAt={lastUpdated}
      pollMs={30_000}
      actions={
        <button type="button" className="btn primary" onClick={openCreate}>
          <kbd>n</kbd>novo link
        </button>
      }
      hints={hints}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      {formOpen && (
        <Panel title={editing ? "editar link" : "novo link"} sub="esc cancela" color="accent" focus>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label={editing ? "Editar link" : "Novo link de internet"}>
            <div className="form">
              <LnkField id="name" label="Nome" error={errors.name?.message} full>
                <input id="name" placeholder="Link principal, Fibra VIVO..." aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-e" : undefined} {...form.register("name")} />
              </LnkField>
              <LnkField id="location" label="Local (opcional)">
                <input id="location" placeholder="Itaguaí, Recreio..." {...form.register("location")} />
              </LnkField>
              <LnkField id="site" label="Unidade">
                <select id="site" {...form.register("site")}>
                  <option value="">Não definida</option>
                  {SITE_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {SITE_NAMES[k]}
                    </option>
                  ))}
                </select>
              </LnkField>
              <LnkField id="description" label="Descrição (opcional)" full>
                <input id="description" placeholder="Provedor, contrato..." {...form.register("description")} />
              </LnkField>
            </div>

            <div style={{ height: 18 }} />
            <Panel title="banda contratada" sub="opcional" color="info">
              <div className="form">
                <LnkField id="contractedDownloadMbps" label="↓ Download (Mbps)" error={errors.contractedDownloadMbps?.message}>
                  <input id="contractedDownloadMbps" type="number" step="any" placeholder="ex: 100" aria-invalid={!!errors.contractedDownloadMbps} aria-describedby={errors.contractedDownloadMbps ? "contractedDownloadMbps-e" : undefined} {...form.register("contractedDownloadMbps", { valueAsNumber: true })} />
                </LnkField>
                <LnkField id="contractedUploadMbps" label="↑ Upload (Mbps)" error={errors.contractedUploadMbps?.message}>
                  <input id="contractedUploadMbps" type="number" step="any" placeholder="ex: 50" aria-invalid={!!errors.contractedUploadMbps} aria-describedby={errors.contractedUploadMbps ? "contractedUploadMbps-e" : undefined} {...form.register("contractedUploadMbps", { valueAsNumber: true })} />
                </LnkField>
              </div>
            </Panel>

            <div style={{ height: 18 }} />
            <Panel title="tráfego RouterOS" sub="opcional" color="info">
              <div className="form">
                <LnkField id="mikrotikDeviceId" label="Mikrotik">
                  <select
                    id="mikrotikDeviceId"
                    {...form.register("mikrotikDeviceId")}
                    onChange={(e) => {
                      form.setValue("mikrotikDeviceId", e.target.value);
                      setTrafficTest({ state: "idle" });
                    }}
                  >
                    <option value="">Não configurado</option>
                    {mikrotiks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.ip})
                      </option>
                    ))}
                  </select>
                </LnkField>
                <LnkField id="mikrotikInterface" label="Interface">
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      id="mikrotikInterface"
                      placeholder="ether1, sfp1..."
                      aria-invalid={trafficTest.state === "error"}
                      {...form.register("mikrotikInterface")}
                      onChange={(e) => {
                        form.setValue("mikrotikInterface", e.target.value);
                        setTrafficTest({ state: "idle" });
                      }}
                    />
                    <button type="button" className="btn" disabled={testing} onClick={() => testTraffic()}>
                      {testing ? "…" : "testar"}
                    </button>
                  </div>
                </LnkField>
              </div>
              <div role="status" aria-live="polite">
                {trafficTest.state === "ok" && (
                  <p className="note">
                    <span className="ok">● conexão OK, interface respondendo</span> · ↓ {formatBps(trafficTest.downloadBps)} · ↑ {formatBps(trafficTest.uploadBps)}
                  </p>
                )}
                {trafficTest.state === "error" && <p className="note crit-n">✖ {trafficTest.message}</p>}
                {trafficTest.state === "idle" && (
                  <p className="note">
                    Informe o Mikrotik e a interface e use <b>testar</b> para validar antes de salvar.
                  </p>
                )}
                {testing && <p className="note">◌ conectando ao RouterOS…</p>}
              </div>
            </Panel>

            <div className="btns" style={{ marginTop: 12 }}>
              <button type="submit" className="btn primary" disabled={form.formState.isSubmitting || testing}>
                {form.formState.isSubmitting || testing ? (testing ? "validando…" : "salvando…") : editing ? "salvar" : "criar"}
              </button>
              <button type="button" className="btn" onClick={() => setFormOpen(false)}>
                cancelar
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="links de internet" sub={loading ? undefined : `${filtered.length} de ${links.length}`} color="info" id="links-list">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <LnkChips<StatusFilter>
            label="Filtro de estado"
            value={statusFilter}
            onChange={setStatusFilter}
            chips={[
              { value: "ALL", label: "todos", key: "1", count: links.length },
              { value: "ONLINE", label: "online", key: "2", count: online },
              { value: "OFFLINE", label: "offline", key: "3", count: links.length - online },
            ]}
          />
          <span className="spacer" />
          <input id="lnk-q" className="search" type="search" placeholder="/ buscar link, local, unidade" aria-label="Buscar link" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {loading ? (
          <LnkLoading what="links" />
        ) : error && links.length === 0 ? (
          <LnkError message={error} onRetry={fetchLinks} />
        ) : filtered.length === 0 ? (
          links.length === 0 ? (
            <LnkEmpty
              title="Nenhum link cadastrado."
              hint="Cadastre o primeiro link para acompanhar disponibilidade e banda."
              action={
                <button type="button" className="btn primary" onClick={openCreate}>
                  cadastrar primeiro link
                </button>
              }
            />
          ) : (
            <LnkEmpty title="Nenhum link encontrado para o filtro ou busca." />
          )
        ) : (
          <div className="tblwrap">
            <table className="tbl" aria-label="Lista de links de internet">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Estado</span>
                  </th>
                  <th scope="col">Link</th>
                  <th scope="col" className="hide-md">
                    Local
                  </th>
                  <th scope="col" className="r">
                    ↓ Download
                  </th>
                  <th scope="col" className="r hide-md">
                    ↑ Upload
                  </th>
                  <th scope="col" className="hide-md">
                    Webhooks
                  </th>
                  <th scope="col" className="r">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((link, i) => (
                  <tr
                    key={link.id}
                    data-sel={i === nav.sel ? "true" : undefined}
                    aria-current={i === nav.sel ? "true" : undefined}
                    className={i === nav.sel ? "sel" : undefined}
                    onClick={() => {
                      nav.setSel(i);
                      setDrawerLinkId(link.id);
                    }}
                  >
                    <td className="keep" style={{ width: "3ch" }}>
                      <StateGlyph state={link.isOnline ? "ok" : "crit"} label={link.isOnline ? "online" : "offline"} />
                    </td>
                    <td>
                      <span className="nm">{link.name}</span>
                      {link.description && <span className="sm">{link.description}</span>}
                      {!link.isOnline && link.lastEventAt && <span className="sm crit">offline desde {timeAgo(link.lastEventAt)}</span>}
                    </td>
                    <td className="hide-md">
                      {link.site ? <span title={SITE_NAMES[link.site as keyof typeof SITE_NAMES] ?? link.site}>{link.site}</span> : null}
                      {link.location ? <span className="sm">{link.location}</span> : !link.site ? <span className="dim">—</span> : null}
                    </td>
                    <td className="r">
                      <BandwidthCell current={link.downloadBps} contracted={link.contractedDownloadBps} color="success" label="uso do download contratado" />
                    </td>
                    <td className="r hide-md">
                      <BandwidthCell current={link.uploadBps} contracted={link.contractedUploadBps} color="primary" label="uso do upload contratado" />
                    </td>
                    <td className="hide-md" onClick={(e) => e.stopPropagation()}>
                      <div className="btns">
                        <CopyButton text={`${origin}/api/links/${link.id}/down?token=${link.webhookToken}`} label="DOWN" />
                        <CopyButton text={`${origin}/api/links/${link.id}/up?token=${link.webhookToken}`} label="UP" />
                      </div>
                    </td>
                    <td className="acts" onClick={(e) => e.stopPropagation()}>
                      <span className="btns" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <button type="button" className="btn" onClick={() => router.push(`/links/${link.id}`)} aria-label={`Ver histórico de ${link.name}`}>
                          histórico
                        </button>
                        <button type="button" className="btn" onClick={() => openEdit(link)} aria-label={`Editar ${link.name}`}>
                          editar
                        </button>
                        <button type="button" className="btn danger" onClick={() => setConfirmDeleteId(link.id)} aria-label={`Excluir ${link.name}`}>
                          excluir
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <LinkDetailDrawer linkId={drawerLinkId} onClose={() => setDrawerLinkId(null)} />
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Excluir este link?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={confirmDelete}
      />
    </LnkShell>
  );
}
