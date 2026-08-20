export interface DattoDevice {
  uid: string;
  hostname: string;
  siteName?: string;
  deviceType?: { category?: string } | string;
  operatingSystem?: string;
  intIpAddress?: string;
  extIpAddress?: string;
  lastLoggedInUser?: string;
  online?: boolean;
  lastSeen?: string;
  lastReboot?: string;
  lastAuditDate?: string;
  deleted?: boolean;
}

export interface DattoAlert {
  alertUid: string;
  priority?: string;
  diagnostics?: string;
  timestamp?: string;
  resolved?: boolean;
  alertSourceInfo?: { deviceUid?: string };
}

export interface DattoFetchError {
  status: number;
  message: string;
}

type Result<T> = { data: T; error?: null } | { data?: null; error: DattoFetchError };

const FETCH_TIMEOUT_MS = 30000;

function baseUrl(platform: string): string {
  return `https://${platform}-api.centrastage.net`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getDattoToken(
  platform: string,
  apiKey: string,
  secretKey: string
): Promise<Result<{ accessToken: string }>> {
  try {
    const response = await fetchWithTimeout(`${baseUrl(platform)}/auth/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from("public-client:").toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: apiKey,
        password: secretKey,
      }),
    });

    if (!response.ok) {
      return { error: { status: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
    }

    const data = await response.json();
    if (!data.access_token) {
      return { error: { status: 0, message: "Resposta de autenticação sem access_token" } };
    }

    return { data: { accessToken: data.access_token } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao autenticar com Datto RMM";
    return { error: { status: 0, message } };
  }
}

async function fetchAllPages<T>(
  platform: string,
  accessToken: string,
  path: string,
  extractItems: (body: any) => T[]
): Promise<Result<T[]>> {
  const items: T[] = [];
  let url: string | null = `${baseUrl(platform)}${path}?page=1&max=250`;

  try {
    while (url) {
      const response: Response = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        return { error: { status: response.status, message: `HTTP ${response.status}: ${response.statusText}` } };
      }

      const body = await response.json();
      items.push(...extractItems(body));

      const nextPageUrl: string | undefined = body?.pageDetails?.nextPageUrl;
      url = nextPageUrl || null;
    }

    return { data: items };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao consultar Datto RMM";
    return { error: { status: 0, message } };
  }
}

export async function fetchAllDevices(platform: string, accessToken: string): Promise<Result<DattoDevice[]>> {
  return fetchAllPages<DattoDevice>(
    platform,
    accessToken,
    "/api/v2/account/devices",
    (body) => body?.devices ?? []
  );
}

export async function fetchOpenAlerts(platform: string, accessToken: string): Promise<Result<DattoAlert[]>> {
  return fetchAllPages<DattoAlert>(
    platform,
    accessToken,
    "/api/v2/account/alerts/open",
    (body) => body?.alerts ?? []
  );
}
