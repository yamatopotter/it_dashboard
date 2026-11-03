import { SILENCE_OPTIONS_MIN } from "@/lib/tower-types";

/** Minutos de silêncio válidos: opções fixas da UI ou qualquer inteiro entre 1 e 1440 (24h). */
export function parseSilenceMinutes(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isInteger(n)) return null;
  if ((SILENCE_OPTIONS_MIN as readonly number[]).includes(n)) return n;
  return n >= 1 && n <= 1440 ? n : null;
}
