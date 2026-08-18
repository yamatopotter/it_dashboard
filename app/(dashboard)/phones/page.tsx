"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Smartphone, Trash2, Edit2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { FilterChip } from "@/components/filter-chip";
import { toast } from "sonner";
import type { Phone } from "@prisma/client";
import type { PhonePaginatedResponse } from "@/app/api/phones/route";
import { fmtDate, formatCurrency } from "@/lib/format";

const PAGE_LIMIT = 25;

export default function PhonesPage() {
  const router = useRouter();
  const [phones, setPhones] = useState<Phone[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED" | "CANCELED">("ALL");
  const [expiringFilter, setExpiringFilter] = useState(false);

  const fetchPage = async (p: number, replace: boolean) => {
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_LIMIT));

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (expiringFilter) {
        params.set("expiringIn", "30");
      }

      const res = await fetch(`/api/phones?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: PhonePaginatedResponse = await res.json();
      const newPhones = replace ? data.data : [...phones, ...(data.data || [])];
      setPhones(newPhones.filter(p => p !== null) as Phone[]);
      setHasMore(data.page < Math.ceil(data.total / PAGE_LIMIT));
      setPage(p);
    } catch (err) {
      console.error("[phones] erro ao carregar página:", err);
      toast.error("Erro ao carregar celulares");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, expiringFilter]);

  const handleDelete = async (id: string, number: string) => {
    if (!confirm(`Remover celular ${number}?`)) return;
    try {
      const res = await fetch(`/api/phones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPhones(phones.filter((p) => p.id !== id));
      toast.success("Celular removido");
    } catch (err) {
      toast.error("Erro ao remover celular");
    }
  };

  const isLoyaltyExpiring = (endDate: Date | null) => {
    if (!endDate) return false;
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return endDate >= now && endDate <= thirtyDaysFromNow;
  };

  const isLoyaltyExpired = (endDate: Date | null) => {
    if (!endDate) return false;
    return endDate < new Date();
  };

  const statusBadgeStyle = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800";
      case "SUSPENDED":
        return "bg-yellow-100 text-yellow-800";
      case "CANCELED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div>
      <Topbar
        title="Celulares"
        subtitle="Inventário de dispositivos móveis"
        icon={Smartphone}
      />

      <div className="px-6 py-4 flex items-center justify-between gap-4 bg-muted/50">
        <div className="flex gap-2 flex-wrap">
          <FilterChip
            active={statusFilter === "ALL"}
            onClick={() => setStatusFilter("ALL")}
          >
            Todos
          </FilterChip>
          <FilterChip
            active={statusFilter === "ACTIVE"}
            onClick={() => setStatusFilter("ACTIVE")}
          >
            Ativos
          </FilterChip>
          <FilterChip
            active={statusFilter === "SUSPENDED"}
            onClick={() => setStatusFilter("SUSPENDED")}
          >
            Suspensos
          </FilterChip>
          <FilterChip
            active={statusFilter === "CANCELED"}
            onClick={() => setStatusFilter("CANCELED")}
          >
            Cancelados
          </FilterChip>
          <FilterChip
            active={expiringFilter}
            onClick={() => setExpiringFilter(!expiringFilter)}
          >
            Fidelidade vencendo
          </FilterChip>
        </div>
        <Button onClick={() => router.push("/phones/new")}>+ Novo Celular</Button>
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : phones.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="Nenhum celular cadastrado"
            description="Comece adicionando um novo celular ao inventário"
            action={<Button onClick={() => router.push("/phones/new")}>Novo Celular</Button>}
          />
        ) : (
          <div className="space-y-2">
            {phones.map((phone) => (
              <div
                key={phone.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{phone.phoneNumber}</div>
                    <span className={`text-xs px-2 py-1 rounded ${statusBadgeStyle(phone.status)}`}>
                      {phone.status === "ACTIVE"
                        ? "Ativo"
                        : phone.status === "SUSPENDED"
                        ? "Suspenso"
                        : "Cancelado"}
                    </span>
                    {isLoyaltyExpiring(phone.loyaltyEndDate) && (
                      <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800">
                        Fidelidade vencendo
                      </span>
                    )}
                    {isLoyaltyExpired(phone.loyaltyEndDate) && (
                      <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-800">
                        Fidelidade vencida
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {phone.owner}
                    {phone.department && ` • ${phone.department}`}
                    {phone.carrier && ` • ${phone.carrier}`}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {phone.invoiceAmountCents && `${formatCurrency(phone.invoiceAmountCents / 100)}`}
                    {phone.loyaltyEndDate && ` • Fidelidade: ${fmtDate(phone.loyaltyEndDate)}`}
                    {phone.miradoreBatteryLevel && ` • Bateria: ${phone.miradoreBatteryLevel}%`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/phones/${phone.id}/edit`)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(phone.id, phone.phoneNumber)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => fetchPage(page + 1, false)}
                >
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
