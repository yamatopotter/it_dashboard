"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Phone } from "@prisma/client";
import { phoneCreateSchema, phoneUpdateSchema } from "@/lib/schemas/phone";

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

interface PhoneFormProps {
  phone?: Phone;
}

export function PhoneForm({ phone }: PhoneFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{phone ? "Editar Celular" : "Novo Celular"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phoneNumber">Número de Telefone *</Label>
              <Input
                id="phoneNumber"
                placeholder="(11) 99999-9999"
                {...register("phoneNumber")}
              />
              {errors.phoneNumber && <p className="text-red-500 text-sm mt-1">{errors.phoneNumber.message}</p>}
            </div>
            <div>
              <Label htmlFor="owner">Proprietário *</Label>
              <Input id="owner" {...register("owner")} />
              {errors.owner && <p className="text-red-500 text-sm mt-1">{errors.owner.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="department">Departamento</Label>
              <Input id="department" {...register("department")} />
            </div>
            <div>
              <Label htmlFor="carrier">Operadora</Label>
              <Input id="carrier" {...register("carrier")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="model">Modelo</Label>
              <Input id="model" {...register("model")} />
            </div>
            <div>
              <Label htmlFor="imei">IMEI</Label>
              <Input id="imei" {...register("imei")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select {...register("status")} defaultValue={phone?.status ?? "ACTIVE"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Ativo</SelectItem>
                  <SelectItem value="SUSPENDED">Suspenso</SelectItem>
                  <SelectItem value="CANCELED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="invoiceAmount">Valor da Fatura (R$)</Label>
              <Input id="invoiceAmount" type="number" step="0.01" {...register("invoiceAmount")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contractStartDate">Data de Contrato</Label>
              <Input id="contractStartDate" type="date" {...register("contractStartDate")} />
            </div>
            <div>
              <Label htmlFor="loyaltyEndDate">Fim da Fidelidade</Label>
              <Input id="loyaltyEndDate" type="date" {...register("loyaltyEndDate")} />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
