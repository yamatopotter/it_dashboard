import { generate, verify, generateSecret } from "otplib";
import { encrypt, decrypt } from "@/lib/crypto";

export function generateTotpSecret(): string {
  return generateSecret();
}

export function getTotpUri(username: string, secret: string): string {
  const issuer = encodeURIComponent("WatchIT Tower");
  const account = encodeURIComponent(username);
  return `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  const result = await verify({ strategy: "totp", token, secret });
  return result.valid;
}

export async function generateTotpToken(secret: string): Promise<string> {
  return generate({ strategy: "totp", secret });
}

export function encryptSecret(secret: string): string {
  return encrypt(secret);
}

export function decryptSecret(encrypted: string): string {
  return decrypt(encrypted);
}
