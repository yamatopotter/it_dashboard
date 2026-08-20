"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { Monitor } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Computer } from "@prisma/client";
import type { ComputerPaginatedResponse } from "@/app/api/computers/route";
import { fmtDateTime } from "@/lib/format";

const PAGE_LIMIT = 25;

const PRIORITY_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Moderate: "bg-amber-100 text-amber-800",
  Low: "bg-blue-100 text-blue-800",
  Information: "bg-gray-100 text-gray-800",
};

export default function ComputersPage() {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [onlineFilter, setOnlineFilter] = useState<"ALL" | "true" | "false">("ALL");
  const [alertsFilter, setAlertsFilter] = useState(false);

  const fetchPage = async (p: number, replace: boolean) => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_LIMIT));

      if (onlineFilter !== "ALL") {
        params.set("online", onlineFilter);
      }
      if (alertsFilter) {
        params.set("hasAlerts", "true");
      }

      const res = await fetch(`/api/computers?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ComputerPaginatedResponse = await res.json();
      const newComputers = replace ? data.data : [...computers, ...(data.data || [])];
      setComputers(newComputers.filter((c) => c !== null) as Computer[]);
      setHasMore(data.page < Math.ceil(data.total / PAGE_LIMIT));
      setPage(p);
    } catch (err) {
      console.error("[computers] erro ao carregar página:", err);
      toast.error("Erro ao carregar computadores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineFilter, alertsFilter]);

  return (
    <div>
      <Topbar
        title="Computadores"
        subtitle="Inventário sincronizado do Datto RMM"
        icon={Monitor}
      />

      <div className="px-6 py-4 flex items-center justify-between gap-4 bg-muted/50">
        <div className="flex gap-2 flex-wrap">
          <FilterChip active={onlineFilter === "ALL"} onClick={() => setOnlineFilter("ALL")}>
            Todos
          </FilterChip>
          <FilterChip active={onlineFilter === "true"} onClick={() => setOnlineFilter("true")}>
            Online
          </FilterChip>
          <FilterChip active={onlineFilter === "false"} onClick={() => setOnlineFilter("false")}>
            Offline
          </FilterChip>
          <FilterChip active={alertsFilter} onClick={() => setAlertsFilter(!alertsFilter)}>
            Com alertas
          </FilterChip>
        </div>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : computers.length === 0 ? (
          <EmptyState
            icon={Monitor}
            title="Nenhum computador sincronizado"
            description="Configure a integração Datto RMM em Sistema para trazer o inventário de máquinas"
          />
        ) : (
          <div className="space-y-2">
            {computers.map((computer) => (
              <div
                key={computer.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{computer.hostname}</div>
                    <StatusBadge isOnline={computer.online} />
                    {computer.highestAlertPriority && (
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          PRIORITY_STYLES[computer.highestAlertPriority] ?? "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {computer.openAlertsCount} alerta{computer.openAlertsCount > 1 ? "s" : ""} ({computer.highestAlertPriority})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {computer.siteName}
                    {computer.operatingSystem && ` • ${computer.operatingSystem}`}
                    {computer.lastLoggedInUser && ` • ${computer.lastLoggedInUser}`}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {computer.intIpAddress && `IP: ${computer.intIpAddress}`}
                    {computer.lastSeenAt && ` • Última vez visto: ${fmtDateTime(computer.lastSeenAt)}`}
                  </div>
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={() => fetchPage(page + 1, false)}>
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
