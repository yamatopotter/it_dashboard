import fs from "fs";
import path from "path";

const LOCK_FILE = path.join(process.cwd(), "data", "setup.lock");
const ENV_FILE  = path.join(process.cwd(), ".env");

export type DbProvider = "sqlite" | "mysql" | "postgresql";

export interface SetupLock {
  provider: DbProvider;
  completedAt: string;
}

// ── Lock file ─────────────────────────────────────────────────────────────────

export function isSetupComplete(): boolean {
  return fs.existsSync(LOCK_FILE);
}

export function markSetupComplete(provider: DbProvider): void {
  const dir = path.dirname(LOCK_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const lock: SetupLock = { provider, completedAt: new Date().toISOString() };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
}

export function readSetupLock(): SetupLock | null {
  if (!fs.existsSync(LOCK_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")) as SetupLock;
  } catch {
    return null;
  }
}

// ── .env writer ───────────────────────────────────────────────────────────────

/** Upserts key=value pairs in the .env file without touching unrelated lines. */
export function writeEnvVars(vars: Record<string, string>): void {
  let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";

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

  fs.writeFileSync(ENV_FILE, content);
}

// ── Schema patcher ────────────────────────────────────────────────────────────

const SCHEMA_FILE = path.join(process.cwd(), "prisma", "schema.prisma");

/** Replaces the `provider = "..."` line in schema.prisma with the chosen provider. */
export function patchSchema(provider: DbProvider): void {
  const content = fs.readFileSync(SCHEMA_FILE, "utf8");
  const patched = content.replace(
    /provider\s*=\s*"(postgresql|mysql|sqlite)"/,
    `provider = "${provider}"`,
  );
  fs.writeFileSync(SCHEMA_FILE, patched);
}

// ── Connection string builder ─────────────────────────────────────────────────

export function buildConnectionUrl(
  provider: DbProvider,
  fields: {
    sqlitePath?: string;
    host?: string;
    port?: string;
    database?: string;
    username?: string;
    password?: string;
  },
): string {
  if (provider === "sqlite") {
    const p = fields.sqlitePath ?? "./data/watchit.db";
    return p.startsWith("file:") ? p : `file:${p}`;
  }

  const { host = "localhost", database = "", username = "", password = "" } = fields;
  const port = fields.port ?? (provider === "mysql" ? "3306" : "5432");
  const scheme = provider === "mysql" ? "mysql" : "postgresql";
  const encodedPass = encodeURIComponent(password);
  const auth = password ? `${encodeURIComponent(username)}:${encodedPass}` : encodeURIComponent(username);
  return `${scheme}://${auth}@${host}:${port}/${database}`;
}
