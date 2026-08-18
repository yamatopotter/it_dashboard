import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Topbar } from "@/components/topbar";
import { PhoneForm } from "@/components/phone-form";
import { Smartphone } from "lucide-react";

export default async function EditPhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const phone = await db.phone.findUnique({ where: { id } });

  if (!phone) notFound();

  return (
    <div>
      <Topbar
        title="Editar Celular"
        subtitle={phone.phoneNumber}
        icon={Smartphone}
      />
      <div className="px-6 py-6">
        <PhoneForm phone={phone} />
      </div>
    </div>
  );
}
