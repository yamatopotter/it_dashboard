import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WtopScreen } from "@/components/wtop/wtop-screen";

export const metadata = { title: "WatchIT" };

/** wtop (btop literal) sobre o snapshot de /api/tower. `?mock=1` usa dados locais; `?tv=1` é o modo TV. */
export default async function WtopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user as { role?: string })?.role ?? "VIEWER";
  const sp = await searchParams;
  return <WtopScreen role={role} mock={sp.mock === "1"} tv={sp.tv === "1"} />;
}
