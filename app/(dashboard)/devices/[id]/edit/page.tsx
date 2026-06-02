import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { DeviceForm } from "@/components/device-form";

export default async function EditDevicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const device = await db.device.findUnique({ where: { id } });

  if (!device) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar Dispositivo</h1>
        <p className="text-muted-foreground text-sm">{device.name}</p>
      </div>
      <DeviceForm device={device} />
    </div>
  );
}
