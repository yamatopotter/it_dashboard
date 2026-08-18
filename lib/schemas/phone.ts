import { z } from "zod";

const brazilPhoneRegex = /^(?:\+55)?(?:1[1-9]|[1-9][1-9])\s?9?\s?[6-9]\d{3}-?\d{4}$/;

export const phoneCreateSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, "Número de telefone é obrigatório")
    .regex(brazilPhoneRegex, "Formato de telefone inválido"),
  owner: z.string().min(1, "Proprietário é obrigatório").max(100),
  department: z.string().max(100).optional().nullable(),
  carrier: z.string().max(100).optional().nullable(),
  model: z.string().max(100).optional().nullable(),
  imei: z.string().max(20).optional().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELED"]).default("ACTIVE"),
  invoiceAmountCents: z.number().int().min(0).optional().nullable(),
  contractStartDate: z.string().datetime({ offset: true }).optional().nullable(),
  loyaltyEndDate: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const phoneUpdateSchema = phoneCreateSchema.partial().extend({
  phoneNumber: z
    .string()
    .min(1)
    .regex(brazilPhoneRegex, "Formato de telefone inválido")
    .optional(),
});
