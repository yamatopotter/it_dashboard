export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { getModules } from "@/lib/module-config";

// Lightweight counts for the sidebar badges. Uses count() queries (no row payload)
// so the sidebar can poll for live offline/online numbers without refetching lists.
export async function GET() {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const modules = await getModules();
  const nvrHidden = modules.nvr ? {} : { type: { notIn: ["DVR", "CAMERA"] as ("DVR" | "CAMERA")[] } };

  const [devicesTotal, devicesOnline, linksTotal, linksOnline, phonesTotal, phonesLoyaltyExpiring, computersTotal, computersOffline] = await Promise.all([
    db.device.count({ where: nvrHidden }),
    db.device.count({ where: { ...nvrHidden, currentStatus: { isOnline: true } } }),
    db.link.count(),
    db.link.count({ where: { isOnline: true } }),
    modules.telephony ? db.phone.count() : Promise.resolve(undefined),
    modules.telephony
      ? db.phone.count({
          where: {
            status: "ACTIVE",
            loyaltyEndDate: { lte: thirtyDaysFromNow, gte: now },
          },
        })
      : Promise.resolve(undefined),
    modules.computers ? db.computer.count({ where: { deletedInDatto: false } }) : Promise.resolve(undefined),
    modules.computers ? db.computer.count({ where: { deletedInDatto: false, online: false } }) : Promise.resolve(undefined),
  ]);

  // A device with no status row yet counts as offline (matches the dashboard layout).
  return NextResponse.json({
    devicesTotal,
    devicesOffline: devicesTotal - devicesOnline,
    linksOnline,
    linksTotal,
    phonesTotal,
    phonesLoyaltyExpiring,
    computersTotal,
    computersOffline,
  });
}
