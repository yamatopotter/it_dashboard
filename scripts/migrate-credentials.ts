import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encrypt } from "../lib/crypto";

const db = new PrismaClient();

async function main() {
  const devices = await db.device.findMany({
    where: {
      AND: [
        { routerosUser: { not: null } },
        { routerosPass: { not: null } },
        { routerosUserEnc: null },
        { routerosPassEnc: null },
      ],
    },
    select: { id: true, name: true, routerosUser: true, routerosPass: true },
  });

  if (devices.length === 0) {
    console.log("Nenhuma credencial em texto plano encontrada. Nada a migrar.");
    return;
  }

  console.log(`Migrando credenciais de ${devices.length} dispositivo(s)...`);

  let migrated = 0;
  for (const device of devices) {
    try {
      await db.device.update({
        where: { id: device.id },
        data: {
          routerosUserEnc: encrypt(device.routerosUser!),
          routerosPassEnc: encrypt(device.routerosPass!),
          routerosUser: null,
          routerosPass: null,
        },
      });
      console.log(`  ✓ ${device.name}`);
      migrated++;
    } catch (err) {
      console.error(`  ✗ ${device.name}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nMigração concluída: ${migrated}/${devices.length} dispositivo(s) migrado(s).`);
}

main()
  .catch((err) => {
    console.error("Erro fatal:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
