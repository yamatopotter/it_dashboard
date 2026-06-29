import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { parseBody } from "@/lib/parse-body";
import {
  isSetupComplete,
  markSetupComplete,
  writeEnvVars,
  patchSchema,
  buildConnectionUrl,
  type DbProvider,
} from "@/lib/setup";

interface ApplyBody {
  provider: DbProvider;
  sqlitePath?: string;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  adminUsername: string;
  adminPassword: string;
}

function run(cmd: string, extra?: Record<string, string>) {
  execSync(cmd, {
    stdio: "pipe",
    env: { ...process.env, ...extra } as NodeJS.ProcessEnv,
    timeout: 60_000,
  });
}

export async function POST(req: NextRequest) {
  if (isSetupComplete()) {
    return NextResponse.json({ error: "Setup já concluído" }, { status: 403 });
  }

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const { provider, adminUsername, adminPassword, ...fields } = parsed.data as ApplyBody;

  if (!adminUsername || adminUsername.length < 3) {
    return NextResponse.json({ error: "Nome de usuário precisa ter ao menos 3 caracteres" }, { status: 400 });
  }
  if (!adminPassword || adminPassword.length < 8) {
    return NextResponse.json({ error: "Senha precisa ter ao menos 8 caracteres" }, { status: 400 });
  }

  const url = buildConnectionUrl(provider, fields);
  const dbEnv: Record<string, string> = { DATABASE_URL: url, DATABASE_PROVIDER: provider };

  const tmpScript = path.join(process.cwd(), "data", "_setup_user.cjs");

  try {
    // 1. Patch schema.prisma provider and persist DB settings in .env
    patchSchema(provider);
    writeEnvVars(dbEnv);

    // 2. Regenerate Prisma client for the selected provider
    run("npx prisma generate", dbEnv);

    // 3. Apply schema: migrate deploy for PostgreSQL, db push for SQLite/MySQL
    if (provider === "postgresql") {
      run("npx prisma migrate deploy", dbEnv);
    } else {
      run("npx prisma db push --skip-generate", dbEnv);
    }

    // 4. Hash the password and write a temp CJS script to create the admin user.
    //    Writing to a file avoids all shell-escaping issues (bcrypt hashes contain
    //    $ signs and special chars that break `node -e "..."` command strings).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bcrypt = require("bcryptjs") as typeof import("bcryptjs");
    const hash = bcrypt.hashSync(adminPassword, 12);

    fs.mkdirSync(path.dirname(tmpScript), { recursive: true });
    fs.writeFileSync(
      tmpScript,
      `
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.user.create({
  data: {
    username: ${JSON.stringify(adminUsername)},
    password: ${JSON.stringify(hash)},
    role: 'ADMIN',
  },
})
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
`,
    );

    run(`node "${tmpScript}"`, dbEnv);

    // 5. Write setup lock — from this point the system considers setup done
    markSetupComplete(provider);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    // Clean up temp script regardless of success/failure
    try { fs.unlinkSync(tmpScript); } catch { /* already gone */ }

    // Exit so PM2/nodemon picks up the new .env and regenerated Prisma client
    setImmediate(() => process.exit(0));
  }
}
