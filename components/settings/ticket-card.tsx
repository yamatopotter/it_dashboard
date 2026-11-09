"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TicketConfig {
  ticketEmailTo: string | null;
  ticketAfterMinutes: number;
}

// Cartão de Configurações › Sistema: chamado automático por e-mail quando um link fica fora por muito tempo.
// Usa o SMTP configurado em "Alertas por e-mail"; sem destinatário, o recurso fica desligado.
export function TicketCard() {
  const [emailTo, setEmailTo] = useState("");
  const [afterMinutes, setAfterMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (cfg: TicketConfig) => {
    setEmailTo(cfg.ticketEmailTo ?? "");
    setAfterMinutes(cfg.ticketAfterMinutes ?? 30);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ticket");
      if (res.ok) apply(await res.json());
    } catch { /* mantém valores padrão */ }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/ticket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketEmailTo: emailTo.trim() || null, ticketAfterMinutes: afterMinutes }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        apply(data);
        setMsg({ ok: true, text: "Configuração salva." });
      } else {
        setMsg({ ok: false, text: typeof data.error === "string" ? data.error : "Erro ao salvar a configuração." });
      }
    } catch {
      setMsg({ ok: false, text: "Erro de rede ao salvar a configuração." });
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
        <Ticket className="h-4 w-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold">Chamado automático de link</span>
      </div>
      <div className="p-5 space-y-5">
        <p className="text-[13px] text-muted-foreground">
          Quando um link continua fora depois do tempo abaixo, o worker abre um chamado enviando um e-mail ao
          destinatário (uma vez por queda). O aviso no Cliq continua imediato. Requer o SMTP configurado em
          “E-mail (SMTP)”; sem destinatário, o recurso fica desligado.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-to" className="text-[13px]">E-mail do chamado (separe vários por vírgula)</Label>
            <Input
              id="ticket-to"
              type="text"
              placeholder="suporte@exemplo.com"
              maxLength={500}
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-after" className="text-[13px]">Abrir após (minutos fora)</Label>
            <Input
              id="ticket-after"
              type="number"
              min={5}
              max={1440}
              value={afterMinutes}
              onChange={(e) => setAfterMinutes(Number(e.target.value))}
              className="text-[13px]"
            />
          </div>
        </div>

        {msg && (
          <div className={cn("flex items-center gap-2 text-[13px] rounded-lg px-3 py-2",
            msg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
          )}>
            {msg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        <Button onClick={save} disabled={saving} size="sm">
          {saving ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
