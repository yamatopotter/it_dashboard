// Tipos e tipos de exports seguros para Edge Runtime
// Implementações que usam process.cwd() estão em lib/setup-node.ts

export type DbProvider = "sqlite" | "mysql" | "postgresql";

export interface SetupLock {
  provider: DbProvider;
  completedAt: string;
}

// Connection string builder — seguro para usar em qualquer lugar (sem process.cwd())
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
