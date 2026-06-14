// ARC-A002: shared fetch helpers for UniFi and Omada connection tests
// Used by device-form.tsx and bulk-device-form.tsx to avoid duplicating fetch+state logic.

export interface UnifiTestPayload {
  controllerIp: string;
  port: number;
  site: string;
  tlsVerify: boolean;
  authMethod: "apikey" | "userpass";
  apiKey?: string;
  unifiUser?: string;
  unifiPass?: string;
  deviceId?: string;
}

export interface OmadaTestPayload {
  controllerIp: string;
  omadacId: string;
  tlsVerify: boolean;
  omadaClientId?: string;
  omadaClientSecret?: string;
  deviceId?: string;
}

export interface TestResult {
  ok: boolean;
  message?: string;
  sites?: unknown;
  error?: string;
}

async function postTest(endpoint: string, payload: object): Promise<{ res: Response; json: TestResult }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as TestResult;
  return { res, json };
}

export async function testUnifiConnection(
  payload: UnifiTestPayload,
  setState: (s: { status: "testing" | "ok" | "error"; message?: string; sites?: unknown }) => void,
): Promise<void> {
  setState({ status: "testing" });
  try {
    const { res, json } = await postTest("/api/devices/test-unifi", payload);
    if (res.ok && json.ok) {
      setState({ status: "ok", message: json.message, sites: json.sites });
    } else {
      setState({ status: "error", message: json.error ?? "Falha no teste" });
    }
  } catch {
    setState({ status: "error", message: "Erro de rede ao testar conexão" });
  }
}

export async function testOmadaConnection(
  payload: OmadaTestPayload,
  setState: (s: { status: "testing" | "ok" | "error"; message?: string; sites?: unknown }) => void,
): Promise<void> {
  setState({ status: "testing" });
  try {
    const { res, json } = await postTest("/api/devices/test-omada", payload);
    if (res.ok && json.ok) {
      setState({ status: "ok", message: json.message, sites: json.sites });
    } else {
      setState({ status: "error", message: json.error ?? "Falha no teste" });
    }
  } catch {
    setState({ status: "error", message: "Erro de rede ao testar conexão" });
  }
}
