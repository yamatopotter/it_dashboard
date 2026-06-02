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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Device } from "@prisma/client";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  ip: z.string().min(1, "IP é obrigatório"),
  type: z.enum(["MIKROTIK", "DVR", "CAMERA", "OTHER"]),
  location: z.string().optional(),
  notes: z.string().optional(),
  pingEnabled: z.boolean(),
  httpEnabled: z.boolean(),
  httpPort: z.number().optional().nullable(),
  httpPath: z.string(),
  snmpEnabled: z.boolean(),
  snmpCommunity: z.string(),
  snmpPort: z.number(),
  routerosEnabled: z.boolean(),
  routerosUser: z.string().optional().nullable(),
  routerosPass: z.string().optional().nullable(),
  routerosPort: z.number(),
  checkInterval: z.number().min(10).max(3600),
});

type FormData = z.infer<typeof schema>;

interface DeviceFormProps {
  device?: Device;
}

export function DeviceForm({ device }: DeviceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: device
      ? {
          name: device.name,
          ip: device.ip,
          type: device.type,
          location: device.location ?? "",
          notes: device.notes ?? "",
          pingEnabled: device.pingEnabled,
          httpEnabled: device.httpEnabled,
          httpPort: device.httpPort ?? undefined,
          httpPath: device.httpPath,
          snmpEnabled: device.snmpEnabled,
          snmpCommunity: device.snmpCommunity,
          snmpPort: device.snmpPort,
          routerosEnabled: device.routerosEnabled,
          routerosUser: device.routerosUser ?? "",
          routerosPass: device.routerosPass ?? "",
          routerosPort: device.routerosPort,
          checkInterval: device.checkInterval,
        }
      : {
          type: "MIKROTIK",
          pingEnabled: true,
          httpEnabled: false,
          httpPath: "/",
          snmpEnabled: false,
          snmpCommunity: "public",
          snmpPort: 161,
          routerosEnabled: false,
          routerosPort: 8728,
          checkInterval: 60,
        },
  });

  const httpEnabled = watch("httpEnabled");
  const snmpEnabled = watch("snmpEnabled");
  const routerosEnabled = watch("routerosEnabled");

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const url = device ? `/api/devices/${device.id}` : "/api/devices";
      const method = device ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Falha ao salvar");

      toast.success(device ? "Dispositivo atualizado!" : "Dispositivo cadastrado!");
      router.push("/devices");
      router.refresh();
    } catch {
      toast.error("Erro ao salvar dispositivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" {...register("name")} placeholder="Mikrotik Escritório" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip">Endereço IP *</Label>
              <Input id="ip" {...register("ip")} placeholder="192.168.1.1" className="font-mono" />
              {errors.ip && <p className="text-xs text-destructive">{errors.ip.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                defaultValue={device?.type ?? "MIKROTIK"}
                onValueChange={(v) => setValue("type", v as FormData["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MIKROTIK">Mikrotik</SelectItem>
                  <SelectItem value="DVR">DVR</SelectItem>
                  <SelectItem value="CAMERA">Câmera</SelectItem>
                  <SelectItem value="OTHER">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Localização</Label>
              <Input id="location" {...register("location")} placeholder="Sala de TI" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" {...register("notes")} rows={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="checkInterval">Intervalo de verificação (segundos)</Label>
            <Input
              id="checkInterval"
              type="number"
              min={10}
              max={3600}
              {...register("checkInterval", { valueAsNumber: true })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Protocolos de Monitoramento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ICMP Ping */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Ping (ICMP)</p>
              <p className="text-xs text-muted-foreground">Verificação básica de disponibilidade</p>
            </div>
            <Switch
              checked={watch("pingEnabled")}
              onCheckedChange={(v) => setValue("pingEnabled", v)}
            />
          </div>

          <Separator />

          {/* HTTP */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">HTTP Check</p>
                <p className="text-xs text-muted-foreground">Verifica se a interface web responde</p>
              </div>
              <Switch
                checked={httpEnabled}
                onCheckedChange={(v) => setValue("httpEnabled", v)}
              />
            </div>
            {httpEnabled && (
              <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-muted">
                <div className="space-y-1">
                  <Label className="text-xs">Porta HTTP</Label>
                  <Input
                    type="number"
                    placeholder="80"
                    {...register("httpPort", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Caminho</Label>
                  <Input placeholder="/" {...register("httpPath")} />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* SNMP */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">SNMP</p>
                <p className="text-xs text-muted-foreground">Métricas via protocolo SNMP v2c</p>
              </div>
              <Switch
                checked={snmpEnabled}
                onCheckedChange={(v) => setValue("snmpEnabled", v)}
              />
            </div>
            {snmpEnabled && (
              <div className="grid grid-cols-2 gap-3 pl-4 border-l-2 border-muted">
                <div className="space-y-1">
                  <Label className="text-xs">Community</Label>
                  <Input placeholder="public" {...register("snmpCommunity")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Porta SNMP</Label>
                  <Input
                    type="number"
                    placeholder="161"
                    {...register("snmpPort", { valueAsNumber: true })}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* RouterOS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">RouterOS API</p>
                <p className="text-xs text-muted-foreground">Métricas detalhadas de Mikrotik</p>
              </div>
              <Switch
                checked={routerosEnabled}
                onCheckedChange={(v) => setValue("routerosEnabled", v)}
              />
            </div>
            {routerosEnabled && (
              <div className="grid grid-cols-3 gap-3 pl-4 border-l-2 border-muted">
                <div className="space-y-1">
                  <Label className="text-xs">Usuário</Label>
                  <Input placeholder="admin" {...register("routerosUser")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Senha</Label>
                  <Input type="password" {...register("routerosPass")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Porta API</Label>
                  <Input
                    type="number"
                    placeholder="8728"
                    {...register("routerosPort", { valueAsNumber: true })}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Salvando..." : device ? "Atualizar" : "Cadastrar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(device ? `/devices/${device.id}` : "/devices")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
