"use client";

import { useState } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { testUnifiConnection, testOmadaConnection } from "@/lib/device-tests";
import type { Device } from "@prisma/client";
import type { FormData } from "@/components/device-form";

type UnifiTestState = { status: "idle" | "testing" | "ok" | "error"; message?: string; sites?: string[] };
type OmadaTestState = { status: "idle" | "testing" | "ok" | "error"; message?: string; sites?: Array<{ siteId: string; name: string }> };

interface DeviceFormProtocolsProps {
  device?: Device & { hasUnifiApiKey?: boolean; hasUnifiCredentials?: boolean; hasOmadaCredentials?: boolean };
}

export function DeviceFormProtocols({ device }: DeviceFormProtocolsProps) {
  const { register, watch, setValue, trigger, control } = useFormContext<FormData>();

  const [unifiTest, setUnifiTest] = useState<UnifiTestState>({ status: "idle" });
  const [omadaTest, setOmadaTest] = useState<OmadaTestState>({ status: "idle" });

  const { fields: oidFields, append: appendOid, remove: removeOid } = useFieldArray({
    control,
    name: "snmpCustomOids",
  });

  const deviceType      = watch("type");
  const httpEnabled     = watch("httpEnabled");
  const snmpEnabled     = watch("snmpEnabled");
  const routerosEnabled = watch("routerosEnabled");
  const unifiEnabled    = watch("unifiEnabled");
  const unifiAuthMethod = watch("unifiAuthMethod");
  const unifiMode       = watch("unifiMode");
  const omadaEnabled    = watch("omadaEnabled");

  async function handleTestUnifi() {
    const values = watch();
    const controllerIp =
      values.unifiMode === "controller" && values.unifiControllerIp
        ? values.unifiControllerIp
        : values.ip;

    if (!controllerIp) {
      setUnifiTest({ status: "error", message: "Informe o IP do dispositivo (ou do controlador)" });
      return;
    }

    await testUnifiConnection(
      {
        controllerIp,
        port: values.unifiPort ?? 443,
        site: values.unifiSite ?? "default",
        tlsVerify: values.unifiTlsVerify ?? true,
        authMethod: values.unifiAuthMethod ?? "apikey",
        apiKey: values.unifiApiKey || undefined,
        unifiUser: values.unifiUser || undefined,
        unifiPass: values.unifiPass || undefined,
        deviceId: device?.id,
      },
      (s) => setUnifiTest(s as UnifiTestState),
    );
  }

  async function handleTestOmada() {
    const values = watch();
    const controllerIp = values.omadaControllerIp?.trim() || values.ip;
    const omadacId     = values.omadacId?.trim();

    if (!controllerIp) {
      setOmadaTest({ status: "error", message: "Informe o IP do controlador" });
      return;
    }
    if (!omadacId) {
      setOmadaTest({ status: "error", message: "Informe o Omada Controller ID (omadacId)" });
      return;
    }

    await testOmadaConnection(
      {
        controllerIp,
        omadacId,
        tlsVerify: values.omadaTlsVerify ?? true,
        omadaClientId: values.omadaClientId || undefined,
        omadaClientSecret: values.omadaClientSecret || undefined,
        deviceId: device?.id,
      },
      (s) => setOmadaTest(s as OmadaTestState),
    );
  }

  return (
    <>
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
              <Label htmlFor="httpPort" className="text-xs">Porta HTTP</Label>
              <Input
                id="httpPort"
                type="number"
                placeholder="80"
                {...register("httpPort", { valueAsNumber: true, onBlur: () => trigger("httpPort") })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="httpPath" className="text-xs">Caminho</Label>
              <Input id="httpPath" placeholder="/" {...register("httpPath")} />
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
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            {/* Community + Port */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="snmpCommunity" className="text-xs">Community</Label>
                <Input id="snmpCommunity" placeholder="public" {...register("snmpCommunity", { onBlur: () => trigger("snmpCommunity") })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="snmpPort" className="text-xs">Porta SNMP</Label>
                <Input id="snmpPort" type="number" placeholder="161" {...register("snmpPort", { valueAsNumber: true })} />
              </div>
            </div>

            {/* OID table */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OIDs monitorados</p>

              {/* Header */}
              <div className="grid text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1"
                style={{ gridTemplateColumns: "2rem 1fr 2.5fr 1fr 3rem 2rem" }}>
                <span></span>
                <span>Label</span>
                <span>OID</span>
                <span>Unidade</span>
                <span>Divisor</span>
                <span></span>
              </div>

              {oidFields.map((field, i) => (
                <div key={field.id} className="grid items-center gap-1.5 px-1"
                  style={{ gridTemplateColumns: "2rem 1fr 2.5fr 1fr 3rem 2rem" }}>
                  {/* Enable toggle */}
                  <Switch
                    checked={watch(`snmpCustomOids.${i}.enabled`)}
                    onCheckedChange={(v) => setValue(`snmpCustomOids.${i}.enabled`, v)}
                  />
                  {/* Label */}
                  <Input
                    {...register(`snmpCustomOids.${i}.label`)}
                    placeholder="CPU"
                    className="h-7 text-xs"
                  />
                  {/* OID principal + OID total opcional (para métricas de razão) */}
                  <div className="space-y-1">
                    <Input
                      {...register(`snmpCustomOids.${i}.oid`)}
                      placeholder="1.3.6.1.2.1…"
                      className="h-7 text-xs font-mono"
                    />
                    <Input
                      {...register(`snmpCustomOids.${i}.oidTotal`)}
                      placeholder="OID total (razão, opcional)"
                      className="h-6 text-[10px] font-mono text-muted-foreground"
                    />
                  </div>
                  {/* Unit */}
                  <Input
                    {...register(`snmpCustomOids.${i}.unit`)}
                    placeholder="%"
                    className="h-7 text-xs"
                  />
                  {/* Divisor */}
                  <Input
                    {...register(`snmpCustomOids.${i}.divisor`, { valueAsNumber: true, setValueAs: v => v === "" || isNaN(Number(v)) ? undefined : Number(v) })}
                    placeholder="—"
                    type="number"
                    className="h-7 text-xs"
                  />
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeOid(i)}
                    className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Remover OID"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => appendOid({ key: `custom_${Date.now()}`, label: "", oid: "", unit: "", enabled: true })}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar OID
              </button>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* RouterOS — apenas para Mikrotik */}
      {deviceType === "MIKROTIK" && <div className="space-y-3">
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
              <Label htmlFor="routerosUser" className="text-xs">Usuário</Label>
              <Input id="routerosUser" placeholder="admin" {...register("routerosUser", { onBlur: () => trigger("routerosUser") })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="routerosPass" className="text-xs">Senha</Label>
              <PasswordInput id="routerosPass" {...register("routerosPass", { onBlur: () => trigger("routerosPass") })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="routerosPort" className="text-xs">Porta API</Label>
              <Input
                id="routerosPort"
                type="number"
                placeholder="8728"
                {...register("routerosPort", { valueAsNumber: true })}
              />
            </div>
          </div>
        )}
      </div>}

      <Separator />

      {/* UniFi — apenas para UniFi AP */}
      {deviceType === "UNIFI_AP" && <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">UniFi Controller API</p>
            <p className="text-xs text-muted-foreground">SSIDs, clientes e tráfego de APs UniFi</p>
          </div>
          <Switch
            checked={unifiEnabled}
            onCheckedChange={(v) => setValue("unifiEnabled", v)}
          />
        </div>
        {unifiEnabled && (
          <div className="space-y-3 pl-4 border-l-2 border-muted">
            {/* Auth method toggle */}
            <div className="space-y-2">
              <Label className="text-xs">Método de autenticação</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["apikey", "userpass"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setValue("unifiAuthMethod", m)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      unifiAuthMethod === m
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    <p className="font-medium">{m === "apikey" ? "Chave de API" : "Usuário e senha"}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">
                      {m === "apikey"
                        ? "Gerada em Settings → Integrations"
                        : "Login local do controlador (RSSI + SSID)"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            {unifiAuthMethod === "apikey" && (
            <div className="space-y-1">
              <Label htmlFor="unifiApiKey" className="text-xs">
                Chave de API (X-API-KEY)
                {device?.hasUnifiApiKey && (
                  <span className="ml-2 text-muted-foreground font-normal">· chave já configurada</span>
                )}
              </Label>
              <PasswordInput
                id="unifiApiKey"
                placeholder={device?.hasUnifiApiKey ? "Deixe em branco para manter a chave atual" : "Cole a chave gerada em Settings → Control Plane → Integrations"}
                {...register("unifiApiKey")}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Gere a chave em: UniFi Network → Settings → Control Plane → Integrations
              </p>
            </div>
            )}

            {/* User + Password */}
            {unifiAuthMethod === "userpass" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="unifiUser" className="text-xs">
                  Usuário
                  {device?.hasUnifiCredentials && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurado</span>
                  )}
                </Label>
                <Input
                  id="unifiUser"
                  placeholder={device?.hasUnifiCredentials ? "Deixe em branco para manter" : "admin"}
                  {...register("unifiUser")}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unifiPass" className="text-xs">Senha</Label>
                <PasswordInput
                  id="unifiPass"
                  placeholder={device?.hasUnifiCredentials ? "Deixe em branco para manter" : ""}
                  {...register("unifiPass")}
                />
              </div>
            </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="unifiSite" className="text-xs">Site</Label>
                <Input id="unifiSite" placeholder="default" {...register("unifiSite")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unifiPort" className="text-xs">Porta <span className="text-muted-foreground font-normal">(443 para UniFi OS)</span></Label>
                <Input
                  id="unifiPort"
                  type="number"
                  placeholder="443"
                  {...register("unifiPort", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={watch("unifiTlsVerify")}
                onCheckedChange={(v) => setValue("unifiTlsVerify", v)}
              />
              <Label className="text-xs">Verificar certificado TLS</Label>
            </div>

            {/* Modo de conexão */}
            <div className="space-y-2">
              <Label className="text-xs">Modo de conexão</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["standalone", "controller"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setValue("unifiMode", mode)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      unifiMode === mode
                        ? "border-primary bg-primary/5 text-primary font-semibold"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    <p className="font-medium">
                      {mode === "standalone" ? "AP direto / UDM" : "Cloud Key / Controller"}
                    </p>
                    <p className="text-[10px] opacity-70 mt-0.5">
                      {mode === "standalone"
                        ? "O IP do dispositivo é o controlador"
                        : "Controlador em IP separado"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* IP do controlador — apenas no modo controller */}
            {unifiMode === "controller" && (
              <div className="space-y-1">
                <Label htmlFor="unifiControllerIp" className="text-xs">IP do controlador (Cloud Key)</Label>
                <Input
                  id="unifiControllerIp"
                  placeholder="192.168.1.10"
                  className="font-mono"
                  {...register("unifiControllerIp", { onBlur: () => trigger("unifiControllerIp") })}
                />
                <p className="text-[10px] text-muted-foreground">
                  O IP do dispositivo acima identifica o AP; o controlador é acessado neste endereço.
                </p>
              </div>
            )}

            {/* Test connection */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={unifiTest.status === "testing"}
                onClick={handleTestUnifi}
                className="gap-2"
              >
                {unifiTest.status === "testing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                {unifiTest.status === "testing" ? "Testando..." : "Testar conexão"}
              </Button>

              {unifiTest.status === "ok" && (
                <div className="flex items-start gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2 text-xs text-success">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{unifiTest.message}</span>
                </div>
              )}
              {unifiTest.status === "error" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/5 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{unifiTest.message}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>}

      <Separator />

      {/* Omada — apenas para Omada AP */}
      {deviceType === "OMADA_AP" && <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Omada Controller API</p>
            <p className="text-xs text-muted-foreground">SSIDs, clientes e métricas de APs TP-Link Omada</p>
          </div>
          <Switch
            checked={omadaEnabled}
            onCheckedChange={(v) => setValue("omadaEnabled", v)}
          />
        </div>
        {omadaEnabled && (
          <div className="space-y-3 pl-4 border-l-2 border-muted">
            {/* OAuth2 Credentials */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="omadaClientId" className="text-xs">
                  Client ID
                  {device?.hasOmadaCredentials && (
                    <span className="ml-2 text-muted-foreground font-normal">· já configurado</span>
                  )}
                </Label>
                <Input
                  id="omadaClientId"
                  placeholder={device?.hasOmadaCredentials ? "Deixe em branco para manter" : ""}
                  {...register("omadaClientId", { onBlur: () => trigger("omadaClientId") })}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="omadaClientSecret" className="text-xs">Client Secret</Label>
                <PasswordInput
                  id="omadaClientSecret"
                  placeholder={device?.hasOmadaCredentials ? "Deixe em branco para manter" : ""}
                  {...register("omadaClientSecret", { onBlur: () => trigger("omadaClientSecret") })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="omadacId" className="text-xs">Omada Controller ID</Label>
                <Input
                  id="omadacId"
                  placeholder="a6f5e5d78223de677588121e18273675"
                  className="font-mono text-xs"
                  {...register("omadacId", { onBlur: () => trigger("omadacId") })}
                />
                <p className="text-[10px] text-muted-foreground">Identificador do controlador na API</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="omadaControllerIp" className="text-xs">IP do Omada Controller</Label>
                <Input
                  id="omadaControllerIp"
                  placeholder="10.0.0.19"
                  className="font-mono"
                  {...register("omadaControllerIp", { onBlur: () => trigger("omadaControllerIp") })}
                />
                <p className="text-[10px] text-muted-foreground">O IP do dispositivo identifica o AP</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={watch("omadaTlsVerify")}
                onCheckedChange={(v) => setValue("omadaTlsVerify", v)}
              />
              <Label className="text-xs">Verificar certificado TLS</Label>
            </div>

            {/* Test connection + site selector */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={omadaTest.status === "testing"}
                onClick={handleTestOmada}
                className="gap-2"
              >
                {omadaTest.status === "testing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                {omadaTest.status === "testing" ? "Testando..." : "Testar conexão"}
              </Button>

              {omadaTest.status === "ok" && (
                <div className="flex items-start gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2 text-xs text-success">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{omadaTest.message}</span>
                </div>
              )}
              {omadaTest.status === "error" && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/5 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{omadaTest.message}</span>
                </div>
              )}

              {omadaTest.status === "ok" && omadaTest.sites && omadaTest.sites.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="omadaSiteId" className="text-xs">Site</Label>
                  <Select
                    value={watch("omadaSiteId") ?? ""}
                    onValueChange={(v) => {
                      const site = omadaTest.sites?.find((s) => s.siteId === v);
                      setValue("omadaSiteId", v);
                      setValue("omadaSite", site?.name ?? "");
                    }}
                  >
                    <SelectTrigger id="omadaSiteId" className="h-8 text-xs">
                      <SelectValue placeholder="Selecione o site" />
                    </SelectTrigger>
                    <SelectContent>
                      {omadaTest.sites.map((s) => (
                        <SelectItem key={s.siteId} value={s.siteId} className="text-xs">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {watch("omadaSite") && (
                    <p className="text-[10px] text-muted-foreground">
                      Site selecionado: <span className="font-medium">{watch("omadaSite")}</span>
                    </p>
                  )}
                </div>
              )}

              {(!omadaTest.sites || omadaTest.sites.length === 0) && (watch("omadaSite") || watch("omadaSiteId")) && (
                <div className="space-y-1">
                  <Label className="text-xs">Site configurado</Label>
                  <p className="text-xs text-muted-foreground">
                    {watch("omadaSite")} <span className="opacity-50">({watch("omadaSiteId")})</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>}
    </>
  );
}
