"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UI_KEYS, UI_LABELS, DEFAULT_UI, isUiKey, type UiKey } from "@/lib/modules";
import { UI_ROUTE } from "@/lib/ui-route";

export function AppearanceCard() {
  const [defaultUi, setDefaultUi] = useState<UiKey>(DEFAULT_UI);
  const [allowUserUi, setAllowUserUi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/appearance")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { defaultUi: string; allowUserUi: boolean }) => {
        if (isUiKey(d.defaultUi)) setDefaultUi(d.defaultUi);
        setAllowUserUi(!!d.allowUserUi);
      })
      .catch(() => setMsg({ ok: false, text: "Não foi possível carregar a aparência." }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultUi, allowUserUi }),
      });
      if (!res.ok) throw new Error();
      setMsg({ ok: true, text: "Aparência salva." });
    } catch {
      setMsg({ ok: false, text: "Erro ao salvar. Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-[15px] font-bold">Interface padrão</h2>
      <p className="text-[12.5px] text-muted-foreground mt-0.5 mb-4">
        Define a tela que abre ao entrar no sistema. As demais continuam acessíveis pelo endereço.
      </p>
      <div role="radiogroup" aria-label="Interface padrão" className="flex flex-col divide-y divide-border">
        {UI_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between gap-4 py-3">
            <label className="flex items-start gap-3 cursor-pointer flex-1">
              <input
                type="radio"
                name="defaultUi"
                value={key}
                checked={defaultUi === key}
                disabled={loading || saving}
                onChange={() => setDefaultUi(key)}
                className="mt-1"
              />
              <span>
                <span className="block text-[13.5px] font-semibold">{UI_LABELS[key].label}</span>
                <span className="block text-[12px] text-muted-foreground">{UI_LABELS[key].description}</span>
              </span>
            </label>
            <Link href={UI_ROUTE[key]} className="text-[12px] font-semibold text-primary hover:underline">
              ver
            </Link>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 mt-4 text-[13px] cursor-pointer">
        <input
          type="checkbox"
          checked={allowUserUi}
          disabled={loading || saving}
          onChange={(e) => setAllowUserUi(e.target.checked)}
        />
        Permitir que cada usuário troque a sua
      </label>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()} disabled={loading || saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {msg && (
          <p role="status" className={`text-[12.5px] ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
