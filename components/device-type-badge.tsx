import type { DeviceType } from "@prisma/client";
import { DEVICE_TYPE_LABEL } from "@/lib/device-constants";

/** Etiqueta de tipo em texto mono com borda fina (sem ícone colorido: a cor fica reservada ao estado). */
export function DeviceTypeBadge({ type }: { type: DeviceType }) {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-border px-1.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
      {DEVICE_TYPE_LABEL[type]}
    </span>
  );
}
