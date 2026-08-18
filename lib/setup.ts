// Tipos e exports seguros para Edge Runtime
// Implementações que usam process.cwd() ou fs estão em lib/setup-node.ts

export type DbProvider = "sqlite" | "mysql" | "postgresql";

export interface SetupLock {
  provider: DbProvider;
  completedAt: string;
}

// Wrapper seguro para Edge Runtime
// Tenta usar a implementação real em Node.js, volta false em Edge
export async function isSetupComplete(): Promise<boolean> {
  try {
    // Dynamic import evita análise estática do Next.js que reclama sobre process.cwd()
    const setupNode = await import("./setup-node");
    return setupNode.isSetupCompleteNode();
  } catch {
    // Em Edge Runtime ou se houver erro, assume setup incompleto
    return false;
  }
}

// Re-exports das funções Node.js-only para uso em API routes e scripts
export async function markSetupCompleteAsync(provider: DbProvider): Promise<void> {
  const setupNode = await import("./setup-node");
  return setupNode.markSetupComplete(provider);
}

export async function readSetupLockAsync(): Promise<SetupLock | null> {
  const setupNode = await import("./setup-node");
  return setupNode.readSetupLock();
}

export async function writeEnvVarsAsync(vars: Record<string, string>): Promise<void> {
  const setupNode = await import("./setup-node");
  return setupNode.writeEnvVars(vars);
}

export async function patchSchemaAsync(provider: DbProvider): Promise<void> {
  const setupNode = await import("./setup-node");
  return setupNode.patchSchema(provider);
}

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
