import { DeviceForm } from "@/components/device-form";
import { DevPage } from "@/components/tui/dev-shell";

export default function NewDevicePage() {
  return (
    <DevPage title="Novo dispositivo" sub="Cadastre um novo equipamento para monitoramento" back="/devices" backLabel="dispositivos">
      <DeviceForm />
    </DevPage>
  );
}
