"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";

interface CliqConfig {
  cliqEnabled: boolean;
  hasWebhook: boolean;
  cliqChannel: string | null;
  cliqRenotifyMinutes: number;
  cliqLastTestAt: string | null;
  cliqLastError: string | null;
}

// Cartão de Configurações › Sistema: avisos pelo Zoho Cliq (único canal fora da tela).
export function CliqCard() {
  const [enabled, setEnabled] = useState(false);
  const [hasWebhook, setHasWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channel, setChannel] = useState("");
  const [renotifyMinutes, setRenotifyMinutes] = useState(15);
  const [lastTestAt, setLastTestAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (cfg: CliqConfig) => {
    setEnabled(cfg.cliqEnabled ?? false);
    setHasWebhook(!!cfg.hasWebhook);
    setChannel(cfg.cliqChannel ?? "");
    setRenotifyMinutes(cfg.cliqRenotifyMinutes ?? 15);
    setLastTestAt(cfg.cliqLastTestAt ?? null);
    setLastError(cfg.cliqLastError ?? null);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/cliq");
      if (res.ok) apply(await res.json());
    } catch { /* mantém valores padrão */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        cliqEnabled: enabled,
        cliqChannel: channel.trim() || null,
        cliqRenotifyMinutes: renotifyMinutes,
      };
      if (webhookUrl.trim()) body.cliqWebhookUrl = webhookUrl.trim();
      const res = await fetch("/api/settings/cliq", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        apply(data);
        setWebhookUrl("");
        setMsg({ ok: true, text: "Configuração salva." });
      } else {
        setMsg({ ok: false, text: typeof data.error === "string" ? data.error : "Erro ao salvar a configuração." });
      }
    } catch {
      setMsg({ ok: false, text: "Erro de rede ao salvar a configuração." });
    }
    setSaving(false);
  }

  async function sendTest() {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/cliq/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setMsg({ ok: true, text: "Mensagem de teste enviada ao Zoho Cliq." });
      } else {
        setMsg({ ok: false, text: data.error ?? "Falha ao enviar a mensagem de teste." });
      }
    } catch {
      setMsg({ ok: false, text: "Erro de rede ao enviar a mensagem de teste." });
    }
    await load();
    setTesting(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold">Avisos pelo Zoho Cliq</span>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Ativar avisos pelo Zoho Cliq" />
      </div>
      <div className="p-5 space-y-5">
        <p className="text-[13px] text-muted-foreground">
          Envia ao Zoho Cliq a abertura de incidentes críticos, um reaviso único se ninguém reconhecer
          e a recuperação. Itens de uma unidade com link caído são agrupados na mensagem do link.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="cliq-url" className="text-[13px]">
              URL do webhook (bot de entrada)
              {hasWebhook && <span className="ml-2 text-muted-foreground font-normal">· configurado</span>}
            </Label>
            <PasswordInput
              id="cliq-url"
              placeholder={hasWebhook ? "Deixe em branco para manter" : "https://cliq.zoho.com/api/v2/bots/…/incoming?zapikey=…"}
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              autoComplete="off"
              className="text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliq-channel" className="text-[13px]">Canal (rótulo)</Label>
            <Input
              id="cliq-channel"
              placeholder="Ex.: #ti-avisos"
              maxLength={100}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliq-renotify" className="text-[13px]">Reaviso sem reconhecimento (minutos)</Label>
            <Input
              id="cliq-renotify"
              type="number"
              min={1}
              max={1440}
              value={renotifyMinutes}
              onChange={(e) => setRenotifyMinutes(Number(e.target.value))}
              className="text-[13px]"
            />
          </div>
        </div>

        <div className="space-y-1.5 rounded-lg bg-muted/40 p-3.5 border border-border text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Último teste</span>
            <span className="font-medium">{lastTestAt ? fmtDateTime(lastTestAt) : "Nunca"}</span>
          </div>
          {lastError && <p className="text-destructive text-[12px] pt-1">Último erro: {lastError}</p>}
        </div>

        {msg && (
          <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
            msg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
          )}>
            {msg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? "Salvando…" : "Salvar configuração"}
          </Button>
          <Button onClick={sendTest} disabled={testing || !hasWebhook} variant="outline" size="sm">
            <Send className={cn("h-3.5 w-3.5 mr-1.5", testing && "animate-pulse")} />
            {testing ? "Enviando…" : "Enviar mensagem de teste"}
          </Button>
        </div>
      </div>
    </div>
  );
}
