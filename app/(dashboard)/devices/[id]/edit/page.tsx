import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { DeviceForm } from "@/components/device-form";
import { DevPage } from "@/components/tui/dev-shell";

export default async function EditDevicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const device = await db.device.findUnique({ where: { id } });

  if (!device) notFound();

  return (
    <DevPage title="Editar dispositivo" sub={`${device.name} · ${device.ip}`} back={`/devices/${id}`} backLabel="dispositivo">
      <DeviceForm device={device} />
    </DevPage>
  );
}
