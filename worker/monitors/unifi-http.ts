import * as https from "https";
import { getAgent } from "../connections/http-agent";

// Cap controller responses to avoid buffering an unbounded payload in worker memory
// (a misbehaving or malicious controller could stream megabytes of client data).
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB

export function normalizeNetworkError(err: NodeJS.ErrnoException, host: string, port: number): Error {
  if (err.code === "ECONNREFUSED")
    return new Error(`Conexão recusada em ${host}:${port} — verifique IP e porta`);
  if (err.code === "ETIMEDOUT" || err.message.includes("Timeout"))
    return new Error(`Timeout ao conectar a ${host}:${port}`);
  if (["DEPTH_ZERO_SELF_SIGNED_CERT","CERT_HAS_EXPIRED","UNABLE_TO_VERIFY_LEAF_SIGNATURE","ERR_TLS_CERT_ALTNAME_INVALID"].includes(err.code ?? ""))
    return new Error("Certificado TLS inválido — desabilite 'Verificar certificado TLS' para aceitar certificados autoassinados");
  return err;
}

interface HttpResult { status: number; body: unknown; cookies: string[] }

// Single request primitive. Uses a keep-alive agent per (host, port, tlsVerify) so TLS
// connections are reused across calls; if a reused socket was closed by the controller
// while idle, the request is retried once on a fresh socket.
function request(
  host: string, port: number, path: string, method: "GET" | "POST",
  headers: Record<string, string | number>, bodyStr: string | undefined, tlsVerify: boolean,
  retried = false,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, port, path, method, headers, rejectUnauthorized: tlsVerify,
        agent: getAgent(host, port, tlsVerify) },
      (res) => {
        let raw = "";
        res.on("data", (c: string) => {
          raw += c;
          if (raw.length > MAX_RESPONSE_BYTES) req.destroy(new Error(`Resposta excedeu ${MAX_RESPONSE_BYTES} bytes`));
        });
        res.on("end", () => {
          const cookies = ((res.headers["set-cookie"] ?? []) as string[]);
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw), cookies }); }
          catch { resolve({ status: res.statusCode ?? 0, body: null, cookies }); }
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      if (!retried && (err.code === "ECONNRESET" || err.code === "EPIPE") && (req as { reusedSocket?: boolean }).reusedSocket) {
        request(host, port, path, method, headers, bodyStr, tlsVerify, true).then(resolve, reject);
        return;
      }
      reject(normalizeNetworkError(err, host, port));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Timeout")));
    if (bodyStr !== undefined) req.write(bodyStr);
    req.end();
  });
}

export async function httpsGetApiKey(
  host: string, port: number, path: string, apiKey: string, tlsVerify: boolean,
): Promise<{ status: number; body: unknown }> {
  const { status, body } = await request(host, port, path, "GET",
    { "X-API-KEY": apiKey, Accept: "application/json" }, undefined, tlsVerify);
  return { status, body };
}

export function httpsPostJson(
  host: string, port: number, path: string, body: unknown, tlsVerify: boolean,
): Promise<{ status: number; body: unknown; cookies: string[] }> {
  const bodyStr = JSON.stringify(body);
  return request(host, port, path, "POST",
    { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }, bodyStr, tlsVerify);
}

export async function httpsGetCookie(
  host: string, port: number, path: string, cookie: string, tlsVerify: boolean,
  csrfToken?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { Cookie: cookie, Accept: "application/json" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const { status, body } = await request(host, port, path, "GET", headers, undefined, tlsVerify);
  return { status, body };
}
