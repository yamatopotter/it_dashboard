import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY deve ser uma string hex de 64 caracteres (32 bytes). Gere com: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(stored: string): string {
  const key = getKey();
  const [ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Formato de credencial criptografada inválido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
}

// Resolves credentials from a device, preferring encrypted columns (post-migration)
// and falling back to plaintext columns (pre-migration). Returns null if none set.
export function resolveRouterosCredentials(device: {
  routerosUser:    string | null;
  routerosPass:    string | null;
  routerosUserEnc: string | null;
  routerosPassEnc: string | null;
}): { user: string; pass: string } | null {
  const user = device.routerosUserEnc ? decrypt(device.routerosUserEnc) : device.routerosUser;
  const pass = device.routerosPassEnc ? decrypt(device.routerosPassEnc) : device.routerosPass;
  if (!user || !pass) return null;
  return { user, pass };
}
