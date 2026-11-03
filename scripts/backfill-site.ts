import "dotenv/config";
import { db } from "../lib/db";
import { inferSite } from "../lib/site-infer";

// Uso: npm run backfill:site            (dry-run: só lista)
//      npm run backfill:site -- --apply (grava apenas sugestões inequívocas)
const apply = process.argv.includes("--apply");

async function main() {
  const [devices, links] = await Promise.all([
    db.device.findMany({ where: { site: null }, select: { id: true, name: true, location: true, notes: true } }),
    db.link.findMany({ where: { site: null }, select: { id: true, name: true, location: true, description: true } }),
  ]);

  const rows = [
    ...devices.map((d) => ({
      kind: "Device" as const, id: d.id, name: d.name, location: d.location ?? "",
      suggestion: inferSite({ location: d.location, name: d.name, description: d.notes }),
    })),
    ...links.map((l) => ({
      kind: "Link" as const, id: l.id, name: l.name, location: l.location ?? "",
      suggestion: inferSite({ location: l.location, name: l.name, description: l.description }),
    })),
  ];

  console.table(rows.map((r) => ({ tipo: r.kind, nome: r.name, location: r.location, sugestao: r.suggestion ?? "(sem sugestão)" })));

  const resolved = rows.filter((r) => r.suggestion);
  const unresolved = rows.length - resolved.length;

  if (apply) {
    for (const r of resolved) {
      // where site: null garante que nunca sobrescrevemos uma unidade já definida
      if (r.kind === "Device") await db.device.updateMany({ where: { id: r.id, site: null }, data: { site: r.suggestion! } });
      else await db.link.updateMany({ where: { id: r.id, site: null }, data: { site: r.suggestion! } });
    }
    console.log(`\n${resolved.length} registro(s) atualizado(s).`);
  } else {
    console.log(`\nDRY-RUN: ${resolved.length} registro(s) seriam atualizados (use --apply para gravar).`);
  }
  console.log(`${unresolved} registro(s) sem unidade para revisão manual.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
