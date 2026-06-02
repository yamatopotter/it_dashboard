import { db } from "../lib/db";
import bcrypt from "bcryptjs";
import readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

async function main() {
  const username = await ask("Usuário: ");
  const password = await ask("Senha: ");

  if (!username || !password) {
    console.error("Usuário e senha são obrigatórios.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  await db.user.upsert({
    where: { username },
    update: { password: hash },
    create: { username, password: hash },
  });

  console.log(`\nUsuário "${username}" criado/atualizado com sucesso.`);
  rl.close();
  await db.$disconnect();
}

main().catch(console.error);
