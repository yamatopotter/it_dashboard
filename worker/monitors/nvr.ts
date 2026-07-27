import { createHash, randomBytes } from "crypto";

// Cliente HTTP Digest Auth (RFC 2617) para a API CGI Dahua/Intelbras dos
// NVDs/iNVDs. Porta de scripts/nvd/intelbras_nvr_client.py — os mesmos
// avisos daquele client se aplicam aqui: nomes de campo variam por
// firmware (NVD 33xx vs iNVD 91xx), validar contra um equipamento real
// antes de confiar no parser em produção.

export type ChannelIssueType = "no_recordings" | "gap" | "not_recording_now" | "unreachable";

export interface ChannelIssue {
  channel: number;
  channelName: string;
  issueType: ChannelIssueType;
  detail: string;
  gapMinutes: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface RecordingValidationResult {
  channelsOk: number;
  channelsTotal: number;
  issues: ChannelIssue[];
}

export interface NvrDiskInfo {
  raw: Record<string, string>;
  usagePercent: number | null;
  healthy: boolean | null;
}

// Interface estrutural (não a classe) usada por checkChannel/validateRecording,
// para permitir testes com um cliente falso sem precisar simular o fluxo HTTP
// digest auth inteiro.
export interface NvrClientLike {
  getChannelTitles(): Promise<Map<number, string>>;
  findMediaFiles(channel: number, start: Date, end: Date): Promise<Array<[Date, Date]>>;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop: string | null;
  opaque: string | null;
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function parseDigestChallenge(header: string): DigestChallenge {
  const get = (key: string) => header.match(new RegExp(`${key}="([^"]*)"`))?.[1] ?? null;
  const realm = get("realm");
  const nonce = get("nonce");
  if (!realm || !nonce) throw new Error(`Cabeçalho WWW-Authenticate inválido: ${header}`);
  return { realm, nonce, qop: get("qop"), opaque: get("opaque") };
}

function buildDigestAuthorization(opts: {
  method: string;
  uri: string;
  username: string;
  password: string;
  challenge: DigestChallenge;
}): string {
  const { method, uri, username, password, challenge } = opts;
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");

  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.qop) {
    parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  return `Digest ${parts.join(", ")}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export class NvrClient {
  private readonly baseUrl: string;

  constructor(
    private readonly host: string,
    private readonly username: string,
    private readonly password: string,
    private readonly port: number = 80,
    private readonly useHttps: boolean = false,
    private readonly timeoutMs: number = 10_000
  ) {
    this.baseUrl = `${useHttps ? "https" : "http"}://${host}:${port}`;
  }

  private async get(path: string, params: Record<string, string | number> = {}): Promise<string> {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const requestUri = query ? `${path}?${query}` : path;
    const url = `${this.baseUrl}${requestUri}`;

    const first = await fetchWithTimeout(url, {}, this.timeoutMs);
    if (first.status !== 401) {
      if (!first.ok) throw new Error(`HTTP ${first.status} em ${path}`);
      return first.text();
    }

    const authHeader = first.headers.get("www-authenticate");
    if (!authHeader) throw new Error(`401 sem WWW-Authenticate em ${path}`);
    const challenge = parseDigestChallenge(authHeader);
    const authorization = buildDigestAuthorization({
      method: "GET",
      uri: requestUri,
      username: this.username,
      password: this.password,
      challenge,
    });

    const second = await fetchWithTimeout(url, { headers: { Authorization: authorization } }, this.timeoutMs);
    if (!second.ok) throw new Error(`HTTP ${second.status} em ${path} (após digest auth)`);
    return second.text();
  }

  private static parseKv(text: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of text.trim().split(/\r?\n/)) {
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return result;
  }

  async getChannelTitles(): Promise<Map<number, string>> {
    const text = await this.get("/cgi-bin/configManager.cgi", { action: "getConfig", name: "ChannelTitle" });
    const data = NvrClient.parseKv(text);
    const channels = new Map<number, string>();
    for (const [key, value] of Object.entries(data)) {
      const match = key.match(/table\.ChannelTitle\[(\d+)\]\.Name/);
      if (match) channels.set(Number(match[1]), value.replace(/^"|"$/g, ""));
    }
    return channels;
  }

  async findMediaFiles(channel: number, start: Date, end: Date): Promise<Array<[Date, Date]>> {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    const parse = (s: string) => {
      const [datePart, timePart] = s.split(" ");
      const [y, mo, day] = datePart.split("-").map(Number);
      const [h, mi, se] = timePart.split(":").map(Number);
      return new Date(y, mo - 1, day, h, mi, se);
    };

    const createText = await this.get("/cgi-bin/mediaFileFind.cgi", { action: "factory.create" });
    const objectId = NvrClient.parseKv(createText)["result"];
    if (!objectId) throw new Error(`Falha ao criar objeto mediaFileFind: ${createText}`);

    try {
      await this.get("/cgi-bin/mediaFileFind.cgi", {
        action: "findFile",
        object: objectId,
        "condition.Channel": channel,
        "condition.StartTime": fmt(start),
        "condition.EndTime": fmt(end),
        "condition.Types[0]": "dav",
      });

      const files: Array<[Date, Date]> = [];
      while (true) {
        const text = await this.get("/cgi-bin/mediaFileFind.cgi", {
          action: "findNextFile",
          object: objectId,
          count: 100,
        });
        const data = NvrClient.parseKv(text);
        const found = Number(data["found"] ?? "0") || 0;
        if (found === 0) break;
        for (let i = 0; i < found; i++) {
          const st = data[`items[${i}].StartTime`];
          const et = data[`items[${i}].EndTime`];
          if (st && et) files.push([parse(st), parse(et)]);
        }
        if (found < 100) break;
      }
      return files.sort((a, b) => a[0].getTime() - b[0].getTime());
    } finally {
      try {
        await this.get("/cgi-bin/mediaFileFind.cgi", { action: "destroy", object: objectId });
      } catch {
        // best-effort — não falha a checagem por não liberar o objeto no NVD
      }
    }
  }

  // Storage/disco — endpoint e nomes de campo a validar contra um NVD real
  // antes de confiar em produção (mesmo aviso do client Python).
  async getStorageInfo(): Promise<NvrDiskInfo> {
    const text = await this.get("/cgi-bin/storageDevice.cgi", { action: "getDeviceAllInfo" });
    const raw = NvrClient.parseKv(text);

    const count = Number(raw["count"] ?? "0") || 0;
    let totalBytes = 0;
    let usedBytes = 0;
    let anyUnhealthy = false;
    let sawDisk = false;

    for (let i = 0; i < count; i++) {
      const total = Number(raw[`info[${i}].TotalBytes`] ?? "");
      const used = Number(raw[`info[${i}].UsedBytes`] ?? "");
      const state = raw[`info[${i}].State`];
      if (Number.isFinite(total) && total > 0) {
        sawDisk = true;
        totalBytes += total;
        usedBytes += Number.isFinite(used) ? used : 0;
      }
      if (state && state !== "Normal" && state !== "InUse") anyUnhealthy = true;
    }

    return {
      raw,
      usagePercent: sawDisk ? (usedBytes / totalBytes) * 100 : null,
      healthy: count > 0 ? !anyUnhealthy : null,
    };
  }
}

async function checkChannel(
  client: NvrClientLike,
  channel: number,
  channelName: string,
  hoursWindow: number,
  maxGapMinutes: number
): Promise<ChannelIssue[]> {
  const issues: ChannelIssue[] = [];
  const end = new Date();
  const start = new Date(end.getTime() - hoursWindow * 60 * 60 * 1000);

  let segments: Array<[Date, Date]>;
  try {
    segments = await client.findMediaFiles(channel, start, end);
  } catch (err) {
    return [
      {
        channel,
        channelName,
        issueType: "unreachable",
        detail: `Falha ao consultar canal: ${err instanceof Error ? err.message : String(err)}`,
        gapMinutes: null,
        periodStart: null,
        periodEnd: null,
      },
    ];
  }

  if (segments.length === 0) {
    return [
      {
        channel,
        channelName,
        issueType: "no_recordings",
        detail: `Nenhuma gravação encontrada nas últimas ${hoursWindow}h`,
        gapMinutes: null,
        periodStart: start,
        periodEnd: end,
      },
    ];
  }

  const leadGapMinutes = (segments[0][0].getTime() - start.getTime()) / 60_000;
  if (leadGapMinutes > maxGapMinutes) {
    issues.push({
      channel,
      channelName,
      issueType: "gap",
      detail: `Sem gravação por ${leadGapMinutes.toFixed(0)} min no início da janela`,
      gapMinutes: leadGapMinutes,
      periodStart: start,
      periodEnd: segments[0][0],
    });
  }

  for (let i = 0; i < segments.length - 1; i++) {
    const segEnd = segments[i][1];
    const nextStart = segments[i + 1][0];
    const gapMinutes = (nextStart.getTime() - segEnd.getTime()) / 60_000;
    if (gapMinutes > maxGapMinutes) {
      issues.push({
        channel,
        channelName,
        issueType: "gap",
        detail: `Gap de ${gapMinutes.toFixed(0)} min entre gravações`,
        gapMinutes,
        periodStart: segEnd,
        periodEnd: nextStart,
      });
    }
  }

  const lastEnd = segments[segments.length - 1][1];
  const trailingMinutes = (end.getTime() - lastEnd.getTime()) / 60_000;
  if (trailingMinutes > maxGapMinutes) {
    issues.push({
      channel,
      channelName,
      issueType: "not_recording_now",
      detail: `Sem gravação há ${trailingMinutes.toFixed(0)} min (parece parada)`,
      gapMinutes: trailingMinutes,
      periodStart: lastEnd,
      periodEnd: end,
    });
  }

  return issues;
}

export async function validateRecording(
  client: NvrClientLike,
  hoursWindow: number,
  maxGapMinutes: number
): Promise<RecordingValidationResult> {
  let channelTitles: Map<number, string>;
  try {
    channelTitles = await client.getChannelTitles();
  } catch (err) {
    return {
      channelsOk: 0,
      channelsTotal: 0,
      issues: [
        {
          channel: -1,
          channelName: "(nvr)",
          issueType: "unreachable",
          detail: `NVD inacessível: ${err instanceof Error ? err.message : String(err)}`,
          gapMinutes: null,
          periodStart: null,
          periodEnd: null,
        },
      ],
    };
  }

  const channels = [...channelTitles.keys()].sort((a, b) => a - b);
  let channelsOk = 0;
  const issues: ChannelIssue[] = [];

  for (const channel of channels) {
    const channelName = channelTitles.get(channel) ?? `Canal ${channel + 1}`;
    const channelIssues = await checkChannel(client, channel, channelName, hoursWindow, maxGapMinutes);
    if (channelIssues.length > 0) {
      issues.push(...channelIssues);
    } else {
      channelsOk++;
    }
  }

  return { channelsOk, channelsTotal: channels.length, issues };
}
