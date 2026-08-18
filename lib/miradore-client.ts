export interface MiradoreDevice {
  id: string;
  imei?: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  batteryLevel?: number;
  lastContact?: string;
  complianceState?: string;
}

export interface MiradoreFetchError {
  status: number;
  message: string;
}

export async function fetchMiradoreDevices(
  siteName: string,
  apiKey: string
): Promise<{ devices: MiradoreDevice[]; error?: null } | { devices?: null; error: MiradoreFetchError }> {
  const url = `https://online.miradore.com/${siteName}/api/v2/devices`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      return {
        error: {
          status: response.status,
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const data = await response.json();
    const devices = Array.isArray(data) ? data : data.devices || [];

    return { devices };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido ao conectar com Miradore";
    return {
      error: {
        status: 0,
        message,
      },
    };
  }
}
