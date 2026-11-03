// Zoho Cliq — envio de avisos por webhook/bot de entrada.
// Funções puras (formatação/validação) + um único POST com timeout.

export const CLIQ_TIMEOUT_MS = 10_000;

export type CliqErrorCode = "INVALID_URL" | "TIMEOUT" | "HTTP" | "NETWORK";

export class CliqError extends Error {
  constructor(
    public readonly code: CliqErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CliqError";
  }
}

// ── Validação de URL (SSRF) ───────────────────────────────────────────────

const ZOHO_DOMAINS = ["zoho.com", "zoho.eu", "zoho.in", "zoho.com.au", "zoho.com.cn", "zoho.jp"];

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (ZOHO_DOMAINS.some((d) => h === d || h.endsWith("." + d))) return true;
  return /^cliq\.zoho\.[a-z]+(\.[a-z]+)?$/.test(h);
}

/** Valida a URL do webhook. Devolve null se válida, ou a mensagem de erro (pt-BR). */
export function validateCliqUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "URL inválida.";
  }
  if (u.protocol !== "https:") return "A URL do Zoho Cliq deve usar https.";
  if (u.username || u.password) return "A URL não pode conter credenciais.";
  if (u.port && u.port !== "443") return "A URL não pode usar porta customizada.";
  if (!isAllowedHost(u.hostname)) return "A URL deve apontar para um domínio do Zoho (zoho.com, zoho.eu, zoho.in, ...).";
  return null;
}

// ── Eventos e mensagens ───────────────────────────────────────────────────

export type EntityType = "device" | "link";

interface EntityBase {
  entityType: EntityType;
  id: string;
  name: string;
  /** BAR | BOT | ITA (ou null) */
  site?: string | null;
}

export type NotifyEvent =
  | (EntityBase & { kind: "OPEN"; since: Date; severity?: "CRIT" | "WARN"; affected?: number })
  | (EntityBase & { kind: "RENOTIFY"; since: Date; affected?: number })
  | (EntityBase & { kind: "RECOVER"; since?: Date | null; ackBy?: string | null; ackNote?: string | null })
  | (EntityBase & { kind: "FLAPPING"; count: number; windowMinutes?: number })
  | { kind: "WORKER_STALE"; minutes: number };

export interface CliqButton {
  label: string;
  url: string;
}

export interface CliqMessage {
  text: string;
  buttons?: CliqButton[];
}

const SITE_LABELS: Record<string, string> = { BAR: "Barra", BOT: "Botafogo", ITA: "Itaguaí" };

export function siteLabel(site?: string | null): string | null {
  if (!site) return null;
  return SITE_LABELS[site] ?? site;
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

function title(e: EntityBase): string {
  const s = siteLabel(e.site);
  return s ? `${s} · ${e.name}` : e.name;
}

function affectedText(n?: number): string {
  if (!n || n <= 0) return "";
  return ` · ${n} ${n === 1 ? "equipamento afetado" : "equipamentos afetados"}`;
}

function entityPath(e: EntityBase): string {
  return e.entityType === "link" ? `/links/${e.id}` : `/devices/${e.id}`;
}

/** Texto da mensagem (markdown do Cliq). Puro. */
export function buildAlertText(event: NotifyEvent, now: Date = new Date()): string {
  switch (event.kind) {
    case "OPEN": {
      const icon = event.severity === "WARN" ? "⚠" : "✖";
      return `${icon} **${title(event)}** fora — desde ${hhmm(event.since)}${affectedText(event.affected)}`;
    }
    case "RENOTIFY": {
      const mins = (now.getTime() - event.since.getTime()) / 60_000;
      return `🔔 **${title(event)}** continua fora há ${formatDuration(mins)} e ninguém reconheceu${affectedText(event.affected)}`;
    }
    case "RECOVER": {
      let t = `● **${title(event)}** voltou`;
      if (event.since) t += ` — ficou ${formatDuration((now.getTime() - event.since.getTime()) / 60_000)} fora`;
      if (event.ackBy) t += ` · Ack: ${event.ackBy}${event.ackNote ? `, ${event.ackNote}` : ""}`;
      return t;
    }
    case "FLAPPING":
      return `〰 **${title(event)}** instável — caiu ${event.count}× em ${event.windowMinutes ?? 15} min`;
    case "WORKER_STALE":
      return `⚠ **WatchIT** sem dados há ${formatDuration(event.minutes)} — o monitoramento pode estar parado`;
  }
}

/** Mensagem completa (texto + botão). appUrl vem de APP_URL; sem ela não há botão. */
export function buildAlertMessage(event: NotifyEvent, appUrl?: string | null, now: Date = new Date()): CliqMessage {
  const msg: CliqMessage = { text: buildAlertText(event, now) };
  const base = appUrl?.replace(/\/+$/, "");
  if (base) {
    const path = event.kind === "WORKER_STALE" ? "/system" : entityPath(event);
    msg.buttons = [{ label: "Abrir no WatchIT", url: base + path }];
  }
  return msg;
}

/** Corpo JSON enviado ao Cliq. Isolado para facilitar ajustes de formato. */
export function buildCliqPayload(message: CliqMessage): Record<string, unknown> {
  const payload: Record<string, unknown> = { text: message.text };
  if (message.buttons?.length) {
    payload.buttons = message.buttons.map((b) => ({
      label: b.label,
      type: "+",
      action: { type: "open.url", data: { web: b.url } },
    }));
  }
  return payload;
}

// ── Envio ─────────────────────────────────────────────────────────────────

export async function sendCliq(webhookUrl: string, message: CliqMessage | string): Promise<void> {
  const invalid = validateCliqUrl(webhookUrl);
  if (invalid) throw new CliqError("INVALID_URL", invalid);

  const msg: CliqMessage = typeof message === "string" ? { text: message } : message;
  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCliqPayload(msg)),
      signal: AbortSignal.timeout(CLIQ_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new CliqError("TIMEOUT", `Tempo esgotado (${CLIQ_TIMEOUT_MS / 1000}s) ao falar com o Zoho Cliq.`);
    }
    throw new CliqError("NETWORK", `Falha de rede ao falar com o Zoho Cliq: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new CliqError("HTTP", `Zoho Cliq respondeu HTTP ${res.status}.`, res.status);
  }
}
