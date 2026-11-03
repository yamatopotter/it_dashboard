import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PhoneForm } from "@/components/phone-form";

export default async function EditPhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const phone = await db.phone.findUnique({ where: { id } });

  if (!phone) notFound();

  return <PhoneForm phone={phone} />;
}
