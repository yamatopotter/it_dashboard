"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { MODULE_KEYS, MODULE_LABELS, DEFAULT_MODULES, type ModuleFlags, type ModuleKey } from "@/lib/modules";

export function ModulesCard() {
  const router = useRouter();
  const [flags, setFlags] = useState<ModuleFlags>(DEFAULT_MODULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ModuleKey | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/modules")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ModuleFlags) => setFlags(d))
      .catch(() => setMsg({ ok: false, text: "Não foi possível carregar os módulos." }))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: ModuleKey, value: boolean) {
    setSaving(key);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error();
      setFlags(await res.json());
      setMsg({ ok: true, text: "Módulos atualizados." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Erro ao salvar. Tente novamente." });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-[15px] font-bold">Módulos opcionais</h2>
      <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-4">
        Módulos desligados somem do menu e param de sincronizar. Os dados são mantidos.
      </p>
      <div className="flex flex-col divide-y divide-border">
        {MODULE_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <div className="text-[13.5px] font-semibold">{MODULE_LABELS[key].label}</div>
              <div className="text-[12px] text-muted-foreground">{MODULE_LABELS[key].description}</div>
            </div>
            <Switch
              checked={flags[key]}
              disabled={loading || saving !== null}
              onCheckedChange={(v) => void toggle(key, v)}
              aria-label={MODULE_LABELS[key].label}
            />
          </div>
        ))}
      </div>
      {msg && (
        <p role="status" className={`mt-3 text-[12.5px] ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
