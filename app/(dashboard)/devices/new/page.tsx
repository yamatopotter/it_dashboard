import { DeviceForm } from "@/components/device-form";

export default function NewDevicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Novo Dispositivo</h1>
        <p className="text-muted-foreground text-sm">
          Cadastre um novo equipamento para monitoramento
        </p>
      </div>
      <DeviceForm />
    </div>
  );
}
