import type { DeviceState } from "@/lib/tower-types";
import { STATE_LABEL } from "@/lib/tui-format";

/** Matriz de pontos: 1 por dispositivo (cheio=ok, vazado=suprimido, vermelho=offline, cinza=sem dado). */
export function Dots({ states }: { states: DeviceState[] }) {
  const on = states.filter((s) => s === "ok").length;
  return (
    <span className="dots" role="img" aria-label={`${on} de ${states.length} online`}>
      {states.map((s, i) => (
        <i key={i} className={s} title={STATE_LABEL[s]} />
      ))}
    </span>
  );
}
