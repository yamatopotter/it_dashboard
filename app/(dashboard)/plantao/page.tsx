import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PlantaoScreen } from "@/components/plantao/plantao-screen";

export const metadata = { title: "WatchIT Plantão" };

/** Plantão por unidade sobre o snapshot de /api/tower. `?mock=1` usa dados locais; `?tv=1` é o modo TV. */
export default async function PlantaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user as { role?: string })?.role ?? "VIEWER";
  const sp = await searchParams;
  return <PlantaoScreen role={role} mock={sp.mock === "1"} tv={sp.tv === "1"} />;
}
