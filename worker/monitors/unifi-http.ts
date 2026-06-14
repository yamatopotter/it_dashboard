import * as https from "https";

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

export function httpsGetApiKey(
  host: string, port: number, path: string, apiKey: string, tlsVerify: boolean,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, port, path, method: "GET",
        headers: { "X-API-KEY": apiKey, Accept: "application/json" },
        rejectUnauthorized: tlsVerify },
      (res) => {
        let raw = "";
        res.on("data", (c: string) => {
          raw += c;
          if (raw.length > MAX_RESPONSE_BYTES) req.destroy(new Error(`Resposta excedeu ${MAX_RESPONSE_BYTES} bytes`));
        });
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: null }); }
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => reject(normalizeNetworkError(err, host, port)));
    req.setTimeout(10_000, () => req.destroy(new Error("Timeout")));
    req.end();
  });
}

export function httpsPostJson(
  host: string, port: number, path: string, body: unknown, tlsVerify: boolean,
): Promise<{ status: number; body: unknown; cookies: string[] }> {
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: host, port, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) },
        rejectUnauthorized: tlsVerify },
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
    req.on("error", (err: NodeJS.ErrnoException) => reject(normalizeNetworkError(err, host, port)));
    req.setTimeout(10_000, () => req.destroy(new Error("Timeout")));
    req.write(bodyStr);
    req.end();
  });
}

export function httpsGetCookie(
  host: string, port: number, path: string, cookie: string, tlsVerify: boolean,
  csrfToken?: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Cookie: cookie, Accept: "application/json" };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const req = https.request(
      { hostname: host, port, path, method: "GET", headers, rejectUnauthorized: tlsVerify },
      (res) => {
        let raw = "";
        res.on("data", (c: string) => {
          raw += c;
          if (raw.length > MAX_RESPONSE_BYTES) req.destroy(new Error(`Resposta excedeu ${MAX_RESPONSE_BYTES} bytes`));
        });
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: null }); }
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => reject(normalizeNetworkError(err, host, port)));
    req.setTimeout(10_000, () => req.destroy(new Error("Timeout")));
    req.end();
  });
}
