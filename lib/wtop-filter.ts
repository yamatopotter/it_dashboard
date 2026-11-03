// Filtro estilo k9s, ordenação e busca fuzzy da interface wtop. Funções puras, sem React.
import type { DeviceState, TowerDevice } from "@/lib/tower-types";
import type { SiteKey } from "@/lib/modules";

export interface ParsedFilter {
  site: SiteKey | null;
  /** Tipos pedidos (minúsculos, já expandidos por apelido); null = qualquer. */
  types: string[] | null;
  off: boolean;
  text: string[];
  /** Termos ignorados (chave desconhecida ou sede inválida), exibidos ao usuário. */
  unknown: string[];
}

const SITE_ALIAS: Record<string, SiteKey> = {
  bar: "BAR", barra: "BAR", bot: "BOT", botafogo: "BOT", ita: "ITA", itaguai: "ITA", "itaguaí": "ITA",
};

const TYPE_ALIAS: Record<string, string[]> = {
  sw: ["switch"], switch: ["switch"],
  ap: ["omada_ap", "unifi_ap"], mk: ["mikrotik"], mikrotik: ["mikrotik"],
  outro: ["other"], outros: ["other"],
};

/** Interpreta `sede:ita tipo:switch off texto livre`. Nunca lança: o que não entende vai em `unknown`. */
export function parseFilter(q: string): ParsedFilter {
  const r: ParsedFilter = { site: null, types: null, off: false, text: [], unknown: [] };
  for (const tok of q.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([^:]+):(.*)$/);
    if (m && (m[1] === "sede" || m[1] === "site")) {
      const s = SITE_ALIAS[m[2]];
      if (s) r.site = s;
      else r.unknown.push(tok);
    } else if (m && m[1] === "tipo") {
      if (!m[2]) r.unknown.push(tok);
      else r.types = TYPE_ALIAS[m[2]] ?? [m[2]];
    } else if (m) {
      r.unknown.push(tok);
    } else if (tok === "off") {
      r.off = true;
    } else {
      r.text.push(tok);
    }
  }
  return r;
}

type FilterableDevice = Pick<TowerDevice, "name" | "ip" | "type" | "site" | "state">;

const SWITCH_NAME = /^(sw|css|crs|switch)/i;

function typeMatches(d: FilterableDevice, types: string[]): boolean {
  const t = d.type.toLowerCase();
  return types.some((x) => (x === "switch" ? t === "other" && SWITCH_NAME.test(d.name) : t === x || t.startsWith(x)));
}

/** `off` = qualquer estado diferente de online. */
export function matchesFilter(d: FilterableDevice, f: ParsedFilter): boolean {
  if (f.site && d.site !== f.site) return false;
  if (f.types && !typeMatches(d, f.types)) return false;
  if (f.off && d.state === "ok") return false;
  const hay = `${d.name} ${d.ip}`.toLowerCase();
  return f.text.every((t) => hay.includes(t));
}

export type SortKey = "st" | "name" | "ip" | "type" | "ping";
export interface SortSpec { key: SortKey; dir: 1 | -1 }

const ST_ORDER: Record<DeviceState, number> = { crit: 0, sup: 1, ack: 2, maint: 3, unk: 4, ok: 5 };

export function ipToNumber(ip: string): number {
  return ip.split(".").reduce((a, b) => a * 256 + (Number(b) || 0), 0);
}

/** Ordena sem mutar; empate desempata por nome. Ping ausente vai ao fim no sentido crescente. */
export function sortDevices<T extends TowerDevice>(list: T[], { key, dir }: SortSpec): T[] {
  const val = (d: T): number | string => {
    switch (key) {
      case "st": return ST_ORDER[d.state];
      case "ip": return ipToNumber(d.ip);
      case "ping": return d.responseMs ?? 1e9;
      case "type": return d.type.toLowerCase();
      default: return d.name.toLowerCase();
    }
  };
  return list.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return c * dir || a.name.localeCompare(b.name);
  });
}

/** Pontuação fuzzy (menor = melhor); -1 se `q` não é subsequência de `s`. Vazio casa com 0. */
export function fuzzyScore(q: string, s: string): number {
  const query = q.toLowerCase().replace(/\s+/g, "");
  const hay = s.toLowerCase();
  if (!query) return 0;
  let pos = -1;
  let score = 0;
  for (const ch of query) {
    const i = hay.indexOf(ch, pos + 1);
    if (i < 0) return -1;
    score += i - pos - 1;
    pos = i;
  }
  return score + (hay.includes(query) ? 0 : 5) + (hay.startsWith(query) ? 0 : 1);
}
