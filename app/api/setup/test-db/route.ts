import { NextRequest, NextResponse } from "next/server";
import { isSetupComplete, buildConnectionUrl, type DbProvider } from "@/lib/setup";
import { parseBody } from "@/lib/parse-body";

interface TestDbBody {
  provider: DbProvider;
  sqlitePath?: string;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
}

async function testPostgres(url: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
}

async function testMysql(url: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection(url);
  await conn.query("SELECT 1");
  await conn.end();
}

function testSqlite(sqlitePath: string): void {
  const path = sqlitePath.replace(/^file:/, "");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require("path") as typeof import("path");
  const dir = nodePath.dirname(nodePath.resolve(path));
  fs.mkdirSync(dir, { recursive: true });
  // Verify write access by touching the directory
  fs.accessSync(dir, fs.constants.W_OK);
}

export async function POST(req: NextRequest) {
  if (isSetupComplete()) {
    return NextResponse.json({ error: "Setup já concluído" }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const { provider, ...fields } = parsed.data as TestDbBody;
  const url = buildConnectionUrl(provider, fields);

  try {
    if (provider === "postgresql") await testPostgres(url);
    else if (provider === "mysql") await testMysql(url);
    else testSqlite(fields.sqlitePath ?? "./data/watchit.db");

    return NextResponse.json({ ok: true, url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
