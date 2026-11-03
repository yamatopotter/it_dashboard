import { BulkDeviceForm } from "@/components/bulk-device-form";
import { DevPage } from "@/components/tui/dev-shell";

export default function BulkDevicePage() {
  return (
    <DevPage title="Adicionar em lote" sub="Cadastre vários dispositivos a partir de uma faixa de IPs" back="/devices" backLabel="dispositivos">
      <BulkDeviceForm />
    </DevPage>
  );
}
