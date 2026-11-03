/**
 * Optional micro-benchmark: cold (no reuse) vs warm (pooled connections / cached
 * sessions) monitor cycles for the given device ids. READ-ONLY on the database and
 * only issues the same read commands the worker already issues. Do NOT point it at
 * production hardware unless you mean to.
 *
 * Usage: npx tsx scripts/bench-monitors.ts <deviceId> [<deviceId> ...] [--cycles=5]
 */
import "dotenv/config";
import { db } from "../lib/db";
import {
  resolveRouterosCredentials, resolveUnifiApiKey, resolveUnifiCredentials, resolveOmadaCredentials,
} from "../lib/crypto";
import { checkRouterOS } from "../worker/monitors/routeros";
import { checkUnifi, resetUnifiInformCache, resetUnifiApiKeyCache } from "../worker/monitors/unifi";
import { checkOmada, resetOmadaCache } from "../worker/monitors/omada";
import { closeAllRouterOS } from "../worker/connections/routeros-pool";
import { destroyAllAgents } from "../worker/connections/http-agent";

type Device = NonNullable<Awaited<ReturnType<typeof db.device.findUnique>>>;

async function resetAll(): Promise<void> {
  await closeAllRouterOS();
  destroyAllAgents();
  resetUnifiInformCache();
  resetUnifiApiKeyCache();
  resetOmadaCache();
}

async function once(d: Device): Promise<void> {
  if (d.routerosEnabled) {
    const c = resolveRouterosCredentials(d);
    if (c) await checkRouterOS(d.ip, c.user, c.pass, d.routerosPort);
  }
  if (d.unifiEnabled) {
    const ctrl = d.unifiControllerIp ?? d.ip;
    if (d.unifiAuthMethod === "userpass") {
      const c = resolveUnifiCredentials(d);
      if (c) await checkUnifi(d.ip, ctrl, { method: "userpass", username: c.username, password: c.password }, d.unifiPort, d.unifiSite, d.unifiTlsVerify, d.checkInterval);
    } else {
      const k = resolveUnifiApiKey(d);
      if (k) await checkUnifi(d.ip, ctrl, { method: "apikey", apiKey: k }, d.unifiPort, d.unifiSite, d.unifiTlsVerify, d.checkInterval);
    }
  }
  if (d.omadaEnabled && d.omadacId && d.omadaSiteId) {
    const c = resolveOmadaCredentials(d);
    if (c) await checkOmada(d.ip, d.omadaControllerIp ?? d.ip, d.omadacId, c.clientId, c.clientSecret, d.omadaSiteId, d.omadaTlsVerify, 443, d.checkInterval);
  }
}

async function timeCycles(devices: Device[], cycles: number, warm: boolean): Promise<number[]> {
  const times: number[] = [];
  await resetAll();
  for (let i = 0; i < cycles; i++) {
    if (!warm) await resetAll(); // cold: every cycle starts from scratch
    const t0 = Date.now();
    // Devices run in parallel, like the scheduler does within one cycle
    await Promise.allSettled(devices.map(once));
    times.push(Date.now() - t0);
  }
  return times;
}

const avg = (a: number[]) => Math.round(a.reduce((s, n) => s + n, 0) / Math.max(1, a.length));

async function main() {
  const args = process.argv.slice(2);
  const cycles = Number(args.find((a) => a.startsWith("--cycles="))?.split("=")[1] ?? 5);
  const ids = args.filter((a) => !a.startsWith("--"));
  if (ids.length === 0) {
    console.error("Uso: npx tsx scripts/bench-monitors.ts <deviceId> [...] [--cycles=5]");
    process.exit(1);
  }
  const devices = (await Promise.all(ids.map((id) => db.device.findUnique({ where: { id } })))).filter((d): d is Device => !!d);
  if (devices.length === 0) { console.error("Nenhum device encontrado."); process.exit(1); }

  const cold = await timeCycles(devices, cycles, false);
  const warm = await timeCycles(devices, cycles, true);
  await resetAll();

  console.log(`Devices: ${devices.map((d) => d.name).join(", ")}`);
  console.log(`Frio  (sem reuso)  ms/ciclo: ${cold.join(", ")}  média=${avg(cold)}`);
  console.log(`Quente (com reuso) ms/ciclo: ${warm.join(", ")}  média=${avg(warm)}  (1º ciclo abre conexões; compare os seguintes)`);
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
