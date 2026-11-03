"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Panel } from "@/components/tui/panel";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkField } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { toast } from "sonner";
import type { Phone } from "@prisma/client";

const schema = z.object({
  phoneNumber: z.string().min(1, "Número de telefone é obrigatório"),
  owner: z.string().min(1, "Proprietário é obrigatório"),
  department: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  imei: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELED"]),
  invoiceAmount: z.string().optional().nullable(),
  contractStartDate: z.string().optional().nullable(),
  loyaltyEndDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

const HELP: HelpRow[] = [
  ["tab", "próximo campo"],
  ["⏎", "salvar o formulário"],
  ["esc", "cancelar e voltar (só se nada foi alterado)"],
];


interface PhoneFormProps {
  phone?: Phone;
}

export function PhoneForm({ phone }: PhoneFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      phoneNumber: phone?.phoneNumber ?? "",
      owner: phone?.owner ?? "",
      department: phone?.department ?? "",
      carrier: phone?.carrier ?? "",
      model: phone?.model ?? "",
      imei: phone?.imei ?? "",
      status: phone?.status ?? "ACTIVE",
      invoiceAmount: phone?.invoiceAmountCents ? (phone.invoiceAmountCents / 100).toFixed(2) : "",
      contractStartDate: phone?.contractStartDate ? phone.contractStartDate.toISOString().split("T")[0] : "",
      loyaltyEndDate: phone?.loyaltyEndDate ? phone.loyaltyEndDate.toISOString().split("T")[0] : "",
      notes: phone?.notes ?? "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);
      const invoiceAmountCents = data.invoiceAmount ? Math.round(parseFloat(data.invoiceAmount) * 100) : null;

      const payload = {
        phoneNumber: data.phoneNumber,
        owner: data.owner,
        department: data.department || null,
        carrier: data.carrier || null,
        model: data.model || null,
        imei: data.imei || null,
        status: data.status,
        invoiceAmountCents,
        contractStartDate: data.contractStartDate ? new Date(data.contractStartDate).toISOString() : null,
        loyaltyEndDate: data.loyaltyEndDate ? new Date(data.loyaltyEndDate).toISOString() : null,
        notes: data.notes || null,
      };

      const method = phone ? "PUT" : "POST";
      const url = phone ? `/api/phones/${phone.id}` : "/api/phones";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message || "Erro ao salvar celular");
        return;
      }

      toast.success(phone ? "Celular atualizado" : "Celular criado");
      router.push("/phones");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [help, setHelp] = useState(false);
  useHotkeys({
    "?": () => setHelp((h) => !h),
    Escape: () => {
      if (help) setHelp(false);
      else if (!isDirty) router.back();
    },
  });

  const hints: KeyHint[] = [
    { keys: ["tab"], label: "próximo campo" },
    { keys: ["⏎"], label: "salvar" },
    { keys: ["esc"], label: "cancelar (sem alterações)" },
    { keys: ["?"], label: "ajuda" },
  ];

  const err = (k: keyof FormData) => errors[k]?.message as string | undefined;
  const inv = (k: keyof FormData) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-e` : undefined });

  return (
    <LnkShell
      title={phone ? "EDITAR CELULAR" : "NOVO CELULAR"}
      sub={phone ? phone.phoneNumber : "adicione um dispositivo ao inventário"}
      back={{ href: "/phones", label: "celulares" }}
      hints={hints}
      help={HELP}
      helpOpen={help}
      onHelpClose={() => setHelp(false)}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label={phone ? "Editar celular" : "Novo celular"} style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 }}>
        <Panel title="linha" sub="* obrigatório" color="accent" focus>
          <div className="form">
            <LnkField id="phoneNumber" label="Número de telefone *" error={err("phoneNumber")}>
              <input id="phoneNumber" placeholder="(11) 99999-9999" {...inv("phoneNumber")} {...register("phoneNumber")} />
            </LnkField>
            <LnkField id="owner" label="Proprietário *" error={err("owner")}>
              <input id="owner" {...inv("owner")} {...register("owner")} />
            </LnkField>
            <LnkField id="department" label="Departamento">
              <input id="department" {...register("department")} />
            </LnkField>
            <LnkField id="carrier" label="Operadora">
              <input id="carrier" {...register("carrier")} />
            </LnkField>
            <LnkField id="status" label="Estado">
              <select id="status" {...register("status")}>
                <option value="ACTIVE">Ativo</option>
                <option value="SUSPENDED">Suspenso</option>
                <option value="CANCELED">Cancelado</option>
              </select>
            </LnkField>
          </div>
        </Panel>

        <Panel title="aparelho" color="info">
          <div className="form">
            <LnkField id="model" label="Modelo">
              <input id="model" {...register("model")} />
            </LnkField>
            <LnkField id="imei" label="IMEI">
              <input id="imei" {...register("imei")} />
            </LnkField>
          </div>
        </Panel>

        <Panel title="contrato" color="info">
          <div className="form">
            <LnkField id="invoiceAmount" label="Valor da fatura (R$)">
              <input id="invoiceAmount" type="number" step="0.01" {...register("invoiceAmount")} />
            </LnkField>
            <span />
            <LnkField id="contractStartDate" label="Data de contrato">
              <input id="contractStartDate" type="date" {...register("contractStartDate")} />
            </LnkField>
            <LnkField id="loyaltyEndDate" label="Fim da fidelidade">
              <input id="loyaltyEndDate" type="date" {...register("loyaltyEndDate")} />
            </LnkField>
            <LnkField id="notes" label="Observações" full>
              <textarea id="notes" rows={3} {...register("notes")} />
            </LnkField>
          </div>
        </Panel>

        <div className="btns">
          <button type="submit" className="btn primary" disabled={isSubmitting}>
            {isSubmitting ? "salvando…" : "salvar"}
          </button>
          <button type="button" className="btn" onClick={() => router.back()}>
            cancelar
          </button>
        </div>
      </form>
    </LnkShell>
  );
}
