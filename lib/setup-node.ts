// Node.js-only implementations that use process.cwd()
// This file should only be imported dynamically to avoid Edge Runtime errors

import fs from "fs";
import path from "path";
import type { DbProvider, SetupLock } from "./setup";

// ── Paths ─────────────────────────────────────────────────────────────────────

function getLockFile(): string {
  return path.join(process.cwd(), "data", "setup.lock");
}

function getEnvFile(): string {
  return path.join(process.cwd(), ".env");
}

function getSchemaFile(): string {
  return path.join(process.cwd(), "prisma", "schema.prisma");
}

// ── Lock file ─────────────────────────────────────────────────────────────────

export function isSetupCompleteNode(): boolean {
  return fs.existsSync(getLockFile());
}

export function markSetupComplete(provider: DbProvider): void {
  const lockFile = getLockFile();
  const dir = path.dirname(lockFile);
  fs.mkdirSync(dir, { recursive: true });
  const lock: SetupLock = { provider, completedAt: new Date().toISOString() };
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2));
}

export function readSetupLock(): SetupLock | null {
  const lockFile = getLockFile();
  if (!fs.existsSync(lockFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockFile, "utf8")) as SetupLock;
  } catch {
    return null;
  }
}

// ── .env writer ───────────────────────────────────────────────────────────────

/** Upserts key=value pairs in the .env file without touching unrelated lines. */
export function writeEnvVars(vars: Record<string, string>): void {
  const envFile = getEnvFile();
  let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";

  for (const [key, value] of Object.entries(vars)) {
    const escaped = value.replace(/"/g, '\\"');
    const line = `${key}="${escaped}"`;
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content = content.trimEnd() + (content ? "\n" : "") + line + "\n";
    }
  }

  fs.writeFileSync(envFile, content);
}

// ── Schema patcher ────────────────────────────────────────────────────────

/** Replaces the `provider = "..."` line in schema.prisma with the chosen provider. */
export function patchSchema(provider: DbProvider): void {
  const schemaFile = getSchemaFile();
  const content = fs.readFileSync(schemaFile, "utf8");
  const patched = content.replace(
    /provider\s*=\s*"(postgresql|mysql|sqlite)"/,
    `provider = "${provider}"`,
  );
  fs.writeFileSync(schemaFile, patched);
}
