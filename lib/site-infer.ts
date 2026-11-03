import type { SiteKey } from "@/lib/modules";

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Unidades citadas em um texto (sem acento, sem caixa). */
function sitesIn(text: string): Set<SiteKey> {
  const out = new Set<SiteKey>();
  if (/barra/.test(text)) out.add("BAR");
  if (/botafogo|\bbota\b/.test(text)) out.add("BOT");
  if (/itagua/.test(text)) out.add("ITA");
  return out;
}

/**
 * Infere a unidade a partir de location, name e description.
 * Retorna null se não houver pista ou se houver pistas conflitantes (ambíguo).
 */
export function inferSite(input: {
  location?: string | null;
  name?: string | null;
  description?: string | null;
}): SiteKey | null {
  const found = new Set<SiteKey>();
  for (const f of [input.location, input.name, input.description]) {
    for (const s of sitesIn(norm(f))) found.add(s);
  }
  return found.size === 1 ? [...found][0] : null;
}
