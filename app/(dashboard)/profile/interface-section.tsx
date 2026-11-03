"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";
import { UI_KEYS, UI_LABELS, isUiKey, type UiKey } from "@/lib/modules";

export function InterfaceSection({
  initial,
  allowUserUi,
  defaultUi,
}: {
  initial: string | null;
  allowUserUi: boolean;
  defaultUi: UiKey;
}) {
  const router = useRouter();
  const [value, setValue] = useState<UiKey | null>(isUiKey(initial) ? initial : null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/ui", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiPreference: value }),
      });
      if (!res.ok) throw new Error();
      setMsg({ ok: true, text: "Interface salva. Ela abre ao entrar no sistema." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Erro ao salvar. Tente novamente." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" /> Interface
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!allowUserUi && (
          <p role="alert" className="text-[12.5px] text-amber-600">
            O administrador desativou a troca individual de interface. Está valendo a padrão do sistema ({UI_LABELS[defaultUi].label}).
          </p>
        )}
        <div role="radiogroup" aria-label="Interface" className="flex flex-col gap-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="uiPreference" checked={value === null} disabled={!allowUserUi || saving} onChange={() => setValue(null)} className="mt-1" />
            <span className="text-[13.5px] font-semibold">Usar a padrão do sistema ({UI_LABELS[defaultUi].label})</span>
          </label>
          {UI_KEYS.map((key) => (
            <label key={key} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="uiPreference" checked={value === key} disabled={!allowUserUi || saving} onChange={() => setValue(key)} className="mt-1" />
              <span>
                <span className="block text-[13.5px] font-semibold">{UI_LABELS[key].label}</span>
                <span className="block text-[12px] text-muted-foreground">{UI_LABELS[key].description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!allowUserUi || saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          {msg && <p role="status" className={`text-[12.5px] ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
