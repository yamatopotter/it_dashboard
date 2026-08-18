import { Topbar } from "@/components/topbar";
import { PhoneForm } from "@/components/phone-form";
import { Smartphone } from "lucide-react";

export default function NewPhonePage() {
  return (
    <div>
      <Topbar
        title="Novo Celular"
        subtitle="Adicione um novo dispositivo ao inventário"
        icon={Smartphone}
      />
      <div className="px-6 py-6">
        <PhoneForm />
      </div>
    </div>
  );
}
