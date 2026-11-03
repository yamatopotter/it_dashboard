"use client";

// Diálogo de intervalo de monitoramento em massa (extraído da lista de dispositivos).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const INTERVAL_PRESETS = [
  { label: "30 segundos", value: 30 },
  { label: "1 minuto",    value: 60 },
  { label: "2 minutos",   value: 120 },
  { label: "5 minutos",   value: 300 },
  { label: "10 minutos",  value: 600 },
  { label: "30 minutos",  value: 1800 },
  { label: "1 hora",      value: 3600 },
];

const DEVICE_TYPE_OPTIONS = [
  { label: "Todos os tipos", value: "" },
  { label: "MikroTik",       value: "MIKROTIK" },
  { label: "UniFi AP",       value: "UNIFI_AP" },
  { label: "Omada AP",       value: "OMADA_AP" },
  { label: "DVR",            value: "DVR" },
  { label: "Câmera",         value: "CAMERA" },
  { label: "Outro",          value: "OTHER" },
];

export function GlobalIntervalModal() {
  const [open, setOpen]         = useState(false);
  const [interval, setInterval] = useState<string | null>("60");
  const [type, setType]         = useState<string | null>("");
  const [loading, setLoading]   = useState(false);

  async function handleApply() {
    if (!interval) {
      toast.error("Selecione um intervalo");
      return;
    }
    const seconds = parseInt(interval, 10);
    if (!seconds || seconds < 10 || seconds > 3600) {
      toast.error("Intervalo deve ser entre 10 e 3600 segundos");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/devices/bulk-interval", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: seconds, ...(type ? { type } : {}) }),
      });
      const data = await res.json() as { ok?: boolean; count?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao atualizar intervalo");
        return;
      }
      toast.success(`Intervalo atualizado em ${data.count} dispositivo${data.count !== 1 ? "s" : ""}`);
      setOpen(false);
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
        title="Ajustar intervalo de monitoramento em massa"
      >
        intervalo
      </button>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Intervalo de monitoramento global</DialogTitle>
          <DialogDescription>
            Ajusta o tempo entre verificações de todos os dispositivos selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Intervalo</label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o intervalo" />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Tipo de dispositivo</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Deixe em &quot;Todos os tipos&quot; para aplicar a todos os dispositivos.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={handleApply} disabled={loading}>
            {loading ? "Aplicando..." : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

