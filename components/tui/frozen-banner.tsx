"use client";
import { fmtAge } from "@/lib/tui-format";

interface FrozenBannerProps {
  frozen: boolean;
  ageSec: number;
  workerStale?: boolean;
  /** Mensagem de erro de rede, se houver. */
  error?: string | null;
}

/** Faixa vermelha "DADOS CONGELADOS" quando os dados passam de 60 s ou o worker está stale. */
export function FrozenBanner({ frozen, ageSec, workerStale, error }: FrozenBannerProps) {
  if (!frozen) return null;
  const reason = workerStale ? "worker sem heartbeat" : error ? `sem conexão com o servidor (${error})` : "sem resposta do servidor";
  return (
    <div className="frozen" role="alert">
      <span>
        DADOS CONGELADOS · última atualização há {fmtAge(ageSec)} · {reason}
      </span>
    </div>
  );
}
