import { db } from "../lib/db";
import { checkPing } from "./monitors/ping";
import { checkHttp } from "./monitors/http";
import { checkSnmp } from "./monitors/snmp";
import { checkRouterOS } from "./monitors/routeros";
import { checkUnifi } from "./monitors/unifi";
import { checkOmada, resolveOmadaSiteId } from "./monitors/omada";
import { checkLinkTraffic } from "./monitors/link-traffic";
import { closeAllRouterOS } from "./connections/routeros-pool";
import { destroyAllAgents } from "./connections/http-agent";
import { traced, flushStats, type MonitorPerf } from "./connections/stats";
import { NvrClient, validateRecording } from "./monitors/nvr";
import { processChannelIssues } from "./nvr-channels";
import { syncMiradorePhones } from "./miradore-sync";
import { syncDattoDevices } from "./datto-sync";
import { resolveRouterosCredentials, resolveSnmpCommunity, resolveUnifiApiKey, resolveUnifiCredentials, resolveOmadaCredentials, resolveNvrCredentials } from "../lib/crypto";
import { log } from "../lib/logger";
import { notify } from "../lib/notify";
import { checkLinkTickets } from "./link-ticket";
import { resolveSnmpOids } from "../lib/snmp-defaults";
import type { Device, Link } from "@prisma/client";

const timers          = new Map<string, ReturnType<typeof setInterval>>();
const nvrTimers       = new Map<string, ReturnType<typeof setInterval>>();
const deviceSnapshots = new Map<string, Date>(); // deviceId -> last known updatedAt
const pendingChecks   = new Set<Promise<unknown>>();
const allIntervals    = new Set<ReturnType<typeof setInterval>>();

// Semaphore: at most MAX_CONCURRENT_CHECKS devices polled simultaneously.
// Prevents DB and network saturation when many devices fire at the same time.
const MAX_CONCURRENT_CHECKS = 20;
let activeChecks = 0;
const checkQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeChecks < MAX_CONCURRENT_CHECKS) {
    activeChecks++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => checkQueue.push(resolve));
}

function releaseSlot(): void {
  const next = checkQueue.shift();
  if (next) { next(); } else { activeChecks--; }
}

// Backoff: after BACKOFF_THRESHOLD consecutive failures, skip ticks until skipUntil[deviceId]
const consecutiveFailures = new Map<string, number>();
const skipUntil           = new Map<string, number>(); // deviceId -> epoch ms
export const BACKOFF_THRESHOLD  = 5;
export const BACKOFF_MULTIPLIER = 4;

function trackAsync<T>(p: Promise<T>): Promise<T> {
  pendingChecks.add(p);
  void p.finally(() => pendingChecks.delete(p));
  return p;
}

// Upper bound for a single device check. Monitors have their own timeouts (~5–10s),
// but a hung DB transaction or a misbehaving library could otherwise hold a semaphore
// slot forever, starving every other device. This guarantees the slot is released.
export const CHECK_TIMEOUT_MS = 30_000;

// Validação de gravação NVR envolve várias chamadas HTTP sequenciais (digest
// auth de 2 requests cada, uma por canal) — cadência rara (padrão 1x/dia),
// então vale a pena um teto bem mais alto que os monitores rápidos.
export const NVR_CHECK_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} excedeu ${ms}ms`)), ms);
    if (typeof t === "object" && t !== null && "unref" in t) (t as NodeJS.Timeout).unref();
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

function makeInterval(fn: () => void, ms: number) {
  const id = setInterval(fn, ms);
  allIntervals.add(id);
  return id;
}

export async function shutdown(timeoutMs = 10_000): Promise<void> {
  for (const id of allIntervals) clearInterval(id);
  allIntervals.clear();
  timers.clear();
  nvrTimers.clear();
  consecutiveFailures.clear();
  skipUntil.clear();
  checkQueue.length = 0;
  activeChecks = 0;
  const deadline = new Promise<void>((r) => {
    const t = setTimeout(r, timeoutMs);
    if (typeof t === "object" && t !== null && "unref" in t) (t as NodeJS.Timeout).unref();
  });
  await Promise.race([Promise.allSettled([...pendingChecks]), deadline]);
  // Close pooled RouterOS sessions and keep-alive HTTPS sockets after in-flight work drained
  await Promise.allSettled([closeAllRouterOS()]);
  destroyAllAgents();
}

export async function runChecks(device: Device): Promise<boolean> {
  // Maintenance window — mark as online without running monitors or recording history
  if (device.maintenanceUntil && device.maintenanceUntil > new Date()) {
    const now = new Date();
    await db.deviceStatus.upsert({
      where: { deviceId: device.id },
      update: { isOnline: true, checkedAt: now },
      create: { deviceId: device.id, isOnline: true, checkedAt: now },
    });
    log("info", `[Manutenção] ${device.name} — incidente suprimido até ${device.maintenanceUntil.toISOString()}`, { ip: device.ip });
    return true;
  }

  // Per-monitor duration and connection/session reuse (only for pooled protocols)
  const perf: Record<string, MonitorPerf> = {};
  const perfOf = (name: string) => (p: MonitorPerf) => { if (p.reused !== null) perf[name] = p; };

  const results = await Promise.allSettled([
    device.pingEnabled ? checkPing(device.ip) : Promise.resolve(null),
    device.httpEnabled
      ? checkHttp(device.ip, device.httpPort ?? 80, device.httpPath)
      : Promise.resolve(null),
    device.snmpEnabled
      ? checkSnmp(device.ip, resolveSnmpCommunity(device), device.snmpPort, resolveSnmpOids(device.snmpCustomOids))
      : Promise.resolve(null),
    (() => {
      if (!device.routerosEnabled) return Promise.resolve(null);
      const creds = resolveRouterosCredentials(device);
      return creds
        ? traced(() => checkRouterOS(device.ip, creds.user, creds.pass, device.routerosPort), perfOf("routeros"))
        : Promise.resolve(null);
    })(),
    (() => {
      if (!device.unifiEnabled) return Promise.resolve(null);
      const controllerIp = device.unifiControllerIp ?? device.ip;
      if (device.unifiAuthMethod === "userpass") {
        const creds = resolveUnifiCredentials(device);
        return creds
          ? traced(() => checkUnifi(device.ip, controllerIp, { method: "userpass", username: creds.username, password: creds.password }, device.unifiPort, device.unifiSite, device.unifiTlsVerify, device.checkInterval), perfOf("unifi"))
          : Promise.resolve(null);
      }
      const apiKey = resolveUnifiApiKey(device);
      return apiKey
        ? traced(() => checkUnifi(device.ip, controllerIp, { method: "apikey", apiKey }, device.unifiPort, device.unifiSite, device.unifiTlsVerify, device.checkInterval), perfOf("unifi"))
        : Promise.resolve(null);
    })(),
    (async () => {
      if (!device.omadaEnabled) return null;
      const creds = resolveOmadaCredentials(device);
      if (!creds || !device.omadacId) return null;
      const controllerIp = device.omadaControllerIp ?? device.ip;

      // Self-heal devices created in bulk: only the site name was stored, so
      // resolve its API id from the name once and persist it for future ticks.
      let siteId = device.omadaSiteId;
      if (!siteId) {
        const resolved = await resolveOmadaSiteId(
          controllerIp, device.omadacId, creds.clientId, creds.clientSecret, device.omadaSite ?? "", device.omadaTlsVerify,
        );
        if (!resolved) {
          log("warn", "[Omada] site não encontrado — verifique 'Site' no cadastro (controlador com múltiplos sites e nome divergente)", {
            device: device.name, ip: device.ip, site: device.omadaSite,
          });
          return null;
        }
        siteId = resolved.siteId;
        device.omadaSiteId = siteId;
        await db.device.update({ where: { id: device.id }, data: { omadaSiteId: siteId } });
        log("info", "[Omada] omadaSiteId resolvido e salvo", {
          device: device.name, siteConfigurado: device.omadaSite, siteUsado: resolved.name, siteId,
          porNome: resolved.matchedByName,
        });
      }

      const omadacId = device.omadacId;
      return traced(
        () => checkOmada(device.ip, controllerIp, omadacId, creds.clientId, creds.clientSecret, siteId, device.omadaTlsVerify, 443, device.checkInterval),
        perfOf("omada"),
      );
    })(),
  ]);

  const pingResult     = results[0].status === "fulfilled" ? results[0].value : null;
  const httpResult     = results[1].status === "fulfilled" ? results[1].value : null;
  const snmpResult     = results[2].status === "fulfilled" ? results[2].value : null;
  const routerosResult = results[3].status === "fulfilled" ? results[3].value : null;
  const unifiResult    = results[4].status === "fulfilled" ? results[4].value : null;
  const omadaResult    = results[5].status === "fulfilled" ? results[5].value : null;

  if (results[2].status === "rejected" && device.snmpEnabled) {
    log("error", "[SNMP] monitor falhou", {
      device: device.name, ip: device.ip,
      error: results[2].reason?.message ?? String(results[2].reason),
    });
  }
  if (results[3].status === "rejected" && device.routerosEnabled) {
    log("error", "[RouterOS] monitor falhou", {
      device: device.name, ip: device.ip,
      error: results[3].reason?.message ?? String(results[3].reason),
    });
  }
  if (routerosResult?.dhcpError) {
    log("warn", "[RouterOS] DHCP lease fetch falhou", {
      device: device.name, ip: device.ip, error: routerosResult.dhcpError,
    });
  }
  if (routerosResult?.resourceError) {
    log("warn", "[RouterOS] /system/resource indisponível (uptime/CPU/memória ausentes)", {
      device: device.name, ip: device.ip, error: routerosResult.resourceError,
    });
  }
  if (routerosResult && device.routerosEnabled) {
    log("info", "[RouterOS] DHCP debug", {
      device: device.name, ip: device.ip,
      rawLeases: routerosResult.rawLeaseCount,
      boundLeases: routerosResult.clients.length,
      statuses: routerosResult.leaseStatuses,
    });
  }
  const unifiError = results[4].status === "rejected" && device.unifiEnabled
    ? (results[4].reason?.message ?? String(results[4].reason))
    : null;
  const omadaError = results[5].status === "rejected" && device.omadaEnabled
    ? (results[5].reason?.message ?? String(results[5].reason))
    : null;

  if (unifiError) {
    log("error", "[UniFi] monitor falhou", { device: device.name, ip: device.ip, error: unifiError });
  }
  if (omadaError) {
    log("error", "[Omada] monitor falhou", { device: device.name, ip: device.ip, error: omadaError });
  }

  // Controller API results (Omada/UniFi) take precedence when they report the AP as
  // connected — APs that block ICMP are still marked online by the controller. But if
  // the controller itself says the AP is disconnected (connected=false), that wins over
  // ping, since a controller-reported disconnect is authoritative. Ping/HTTP are
  // fallbacks when no controller monitor is configured.
  const isOnline =
    omadaResult != null ? omadaResult.connected :
    unifiResult != null ? unifiResult.connected :
    pingResult?.alive ??
    httpResult?.ok ??
    false;
  const pingMs   = pingResult?.alive ? pingResult.responseMs : null;
  const httpOk   = httpResult?.ok ?? null;

  const uptime     = routerosResult?.uptime     ?? snmpResult?.uptime     ?? unifiResult?.uptime     ?? omadaResult?.uptime     ?? null;
  const cpuLoad    = routerosResult?.cpuLoad    ?? snmpResult?.cpuLoad    ?? unifiResult?.cpuLoad    ?? omadaResult?.cpuLoad    ?? null;
  const memoryUsed = routerosResult?.memoryUsed ?? snmpResult?.memoryUsed ?? unifiResult?.memoryUsed ?? omadaResult?.memoryUsed ?? null;

  const now = new Date();

  const routerosUpdate = device.routerosEnabled && routerosResult
    ? { routerosData: routerosResult as unknown as import("@prisma/client").Prisma.InputJsonValue }
    : {};

  const unifiUpdate = device.unifiEnabled
    ? unifiResult
      ? { unifiData: unifiResult as unknown as import("@prisma/client").Prisma.InputJsonValue, unifiError: null }
      : { unifiError }
    : {};

  const omadaUpdate = device.omadaEnabled
    ? omadaResult
      ? { omadaData: omadaResult as unknown as import("@prisma/client").Prisma.InputJsonValue, omadaError: null }
      : { omadaError }
    : {};

  const snmpUpdate = device.snmpEnabled && snmpResult && snmpResult.snmpData && Object.keys(snmpResult.snmpData).length > 0
    ? { snmpData: snmpResult.snmpData as unknown as import("@prisma/client").Prisma.InputJsonValue }
    : {};

  await db.$transaction([
    db.deviceStatus.upsert({
      where: { deviceId: device.id },
      update: { isOnline, pingMs, httpOk, uptime, cpuLoad, memoryUsed, ...routerosUpdate, ...unifiUpdate, ...omadaUpdate, ...snmpUpdate, checkedAt: now },
      create: { deviceId: device.id, isOnline, pingMs, httpOk, uptime, cpuLoad, memoryUsed, ...routerosUpdate, ...unifiUpdate, ...omadaUpdate, ...snmpUpdate, checkedAt: now },
    }),
    db.statusHistory.create({
      data: { deviceId: device.id, isOnline, pingMs, cpuLoad, memoryUsed, timestamp: now },
    }),
  ], { timeout: 5_000 });

  const perfFields = Object.fromEntries(
    Object.entries(perf).flatMap(([k, v]) => [[`${k}Ms`, v.durationMs], [`${k}Reused`, v.reused]]),
  );
  if (omadaResult) {
    log("info", `${isOnline ? "✓" : "✗"} ${device.name}`, {
      ...perfFields,
      ip: device.ip,
      clients: omadaResult.totalClients,
      ssids: omadaResult.ssids.length,
    });
  } else if (unifiResult) {
    log("info", `${isOnline ? "✓" : "✗"} ${device.name}`, {
      ...perfFields,
      ip: device.ip,
      clients: unifiResult.totalClients,
      ssids: unifiResult.ssids.length,
    });
  } else if (routerosResult) {
    log("info", `${isOnline ? "✓" : "✗"} ${device.name}`, {
      ...perfFields,
      ip: device.ip,
      dhcpClients: routerosResult.clients.length,
      pingMs: pingMs ?? null,
    });
  } else {
    log("info", `${isOnline ? "✓" : "✗"} ${device.name}`, { ip: device.ip, pingMs: pingMs ?? null });
  }

  return isOnline;
}

export async function runNvrChecks(device: Device): Promise<void> {
  const creds = resolveNvrCredentials(device);
  if (!creds) {
    log("warn", "[NVR] credenciais ausentes, pulando checagem", { device: device.name });
    return;
  }

  const client = new NvrClient(device.ip, creds.user, creds.pass, device.nvrPort, device.nvrUseHttps);

  try {
    const result = await validateRecording(client, device.nvrHoursWindow, device.nvrMaxGapMinutes);
    await processChannelIssues(device.id, device.name, result.issues);
    await db.deviceStatus.upsert({
      where: { deviceId: device.id },
      update: { nvrChannelsOk: result.channelsOk, nvrChannelsTotal: result.channelsTotal },
      create: { deviceId: device.id, nvrChannelsOk: result.channelsOk, nvrChannelsTotal: result.channelsTotal },
    });
    log("info", `[NVR] ${device.name}`, {
      canaisOk: result.channelsOk,
      canaisTotal: result.channelsTotal,
      issues: result.issues.length,
    });
  } catch (err) {
    log("error", "[NVR] validação de gravação falhou", {
      device: device.name, ip: device.ip,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const disk = await client.getStorageInfo();
    await db.deviceStatus.upsert({
      where: { deviceId: device.id },
      update: { nvrDiskData: disk.raw as unknown as import("@prisma/client").Prisma.InputJsonValue, nvrDiskError: null },
      create: { deviceId: device.id, nvrDiskData: disk.raw as unknown as import("@prisma/client").Prisma.InputJsonValue, nvrDiskError: null },
    });
  } catch (err) {
    const nvrDiskError = err instanceof Error ? err.message : String(err);
    await db.deviceStatus.upsert({
      where: { deviceId: device.id },
      update: { nvrDiskError },
      create: { deviceId: device.id, nvrDiskError },
    });
    log("warn", "[NVR] saúde de disco indisponível", { device: device.name, error: nvrDiskError });
  }
}

function scheduleDevice(device: Device) {
  const existing = timers.get(device.id);
  if (existing) {
    clearInterval(existing);
    allIntervals.delete(existing);
  }

  const intervalMs = device.checkInterval * 1000;

  const safeRun = async () => {
    // Skip this tick if device is in exponential backoff cooldown
    const skipTs = skipUntil.get(device.id);
    if (skipTs && Date.now() < skipTs) return;

    await acquireSlot();
    try {
      const isOnline = await withTimeout(runChecks(device), CHECK_TIMEOUT_MS, `runChecks(${device.name})`);
      if (isOnline) {
        const prev = consecutiveFailures.get(device.id) ?? 0;
        consecutiveFailures.set(device.id, 0);
        skipUntil.delete(device.id);
        if (prev >= BACKOFF_THRESHOLD) {
          log("info", "[Backoff] dispositivo recuperado, voltando ao intervalo normal", { device: device.name });
        }
        // Zoho Cliq: aviso de recuperação (lê o ack antes de ele ser limpo abaixo)
        if (prev > 0 || device.cliqNotifiedAt) {
          await notify({ kind: "RECOVER", entityType: "device", id: device.id, name: device.name, site: device.site });
        }
        // Auto-clear offline acknowledgement when device comes back online
        if (device.offlineAcknowledgedAt) {
          await db.device.update({
            where: { id: device.id },
            data: { offlineAcknowledgedAt: null, offlineAcknowledgedNote: null },
          });
        }
      } else {
        const fails = (consecutiveFailures.get(device.id) ?? 0) + 1;
        consecutiveFailures.set(device.id, fails);
        if (fails >= BACKOFF_THRESHOLD) {
          skipUntil.set(device.id, Date.now() + device.checkInterval * BACKOFF_MULTIPLIER * 1000);
          if (fails === BACKOFF_THRESHOLD) {
            log("warn", "[Backoff] 5 falhas consecutivas, reduzindo frequência", {
              device: device.name, ip: device.ip,
              novoIntervaloSecs: device.checkInterval * BACKOFF_MULTIPLIER,
            });
          }
        }
        // Zoho Cliq: avisa a abertura ao atingir o limiar. notify() aplica silêncio,
        // agrupamento por link caído, ack e deduplicação por episódio (cliqNotifiedAt).
        if (fails === device.alertThreshold) {
          await notify({
            kind: "OPEN", entityType: "device", id: device.id, name: device.name, site: device.site,
            since: new Date(Date.now() - (fails - 1) * device.checkInterval * 1000),
          });
        }
      }
    } catch (err: unknown) {
      log("error", "[Scheduler] runChecks falhou", {
        device: device.name, ip: device.ip,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" | ") : undefined,
      });
    } finally {
      releaseSlot();
    }
  };

  void trackAsync(safeRun());

  const timer = makeInterval(() => void trackAsync(safeRun()), intervalMs);
  timers.set(device.id, timer);

  // Monitor NVR: cadência própria e ajustável, independente do checkInterval
  // acima (que continua rodando ping/http/snmp/routeros na cadência normal).
  const existingNvr = nvrTimers.get(device.id);
  if (existingNvr) {
    clearInterval(existingNvr);
    allIntervals.delete(existingNvr);
    nvrTimers.delete(device.id);
  }

  if (device.type === "DVR" && device.nvrEnabled) {
    const nvrIntervalMs = Math.max(device.nvrCheckIntervalMinutes, 1) * 60_000;

    const safeNvrRun = async () => {
      // Módulo NVR pode ser ligado/desligado sem reiniciar: relê a flag a cada ciclo
      const nvrCfg = await db.systemConfig.findUnique({ where: { id: 1 } }).catch(() => null);
      if (!nvrCfg?.moduleNvr) return;
      await acquireSlot();
      try {
        await withTimeout(runNvrChecks(device), NVR_CHECK_TIMEOUT_MS, `runNvrChecks(${device.name})`);
      } catch (err: unknown) {
        log("error", "[NVR] checagem agendada falhou", {
          device: device.name, ip: device.ip,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        releaseSlot();
      }
    };

    void trackAsync(safeNvrRun());
    const nvrTimer = makeInterval(() => void trackAsync(safeNvrRun()), nvrIntervalMs);
    nvrTimers.set(device.id, nvrTimer);
  }
}

function unscheduleDevice(deviceId: string) {
  const timer = timers.get(deviceId);
  if (timer) {
    clearInterval(timer);
    allIntervals.delete(timer);
    timers.delete(deviceId);
    deviceSnapshots.delete(deviceId);
    consecutiveFailures.delete(deviceId);
    skipUntil.delete(deviceId);
  }

  const nvrTimer = nvrTimers.get(deviceId);
  if (nvrTimer) {
    clearInterval(nvrTimer);
    allIntervals.delete(nvrTimer);
    nvrTimers.delete(deviceId);
  }
}

async function runLinkChecks(link: Link & { mikrotikDevice: Device | null }) {
  if (!link.mikrotikDevice || !link.mikrotikInterface) return;

  const dev = link.mikrotikDevice;
  const creds = resolveRouterosCredentials(dev);
  if (!creds) return;

  try {
    let perf: MonitorPerf | null = null;
    const iface = link.mikrotikInterface;
    const result = await traced(
      () => checkLinkTraffic(dev.ip, creds.user, creds.pass, dev.routerosPort, iface),
      (p) => { perf = p; },
    );

    await db.link.update({
      where: { id: link.id },
      data: {
        downloadBps: result.downloadBps,
        uploadBps:   result.uploadBps,
      },
    });

    const p = perf as MonitorPerf | null;
    log("info", `[Link] ${link.name}`, {
      ...(p ? { durationMs: p.durationMs, reused: p.reused } : {}),
      downloadMbps: (result.downloadBps / 1_000_000).toFixed(1),
      uploadMbps:   (result.uploadBps   / 1_000_000).toFixed(1),
    });
  } catch (err: unknown) {
    log("error", "[Link] tráfego falhou", {
      link: link.name, ip: dev.ip, iface: link.mikrotikInterface,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function startScheduler() {
  log("info", "Worker iniciado. Carregando dispositivos...");

  const devices = await db.device.findMany();
  for (const device of devices) {
    scheduleDevice(device);
    deviceSnapshots.set(device.id, device.updatedAt);
  }
  log("info", `${devices.length} dispositivo(s) agendado(s).`);

  void trackAsync(pollLinks());
  void trackAsync(syncMiradorePhones());
  void trackAsync(syncDattoDevices());

  // Run history pruning at startup then every 24h
  void trackAsync(pruneHistory());
  makeInterval(() => void trackAsync(pruneHistory()), 24 * 3_600_000);

  // Heartbeat: lets /api/health detect if the worker has stopped
  const updateHeartbeat = () =>
    db.workerHeartbeat
      .upsert({ where: { id: 1 }, update: { seenAt: new Date() }, create: { id: 1, seenAt: new Date() } })
      .catch(() => {});
  void updateHeartbeat();
  makeInterval(updateHeartbeat, 60_000);
  // Aggregated connection-reuse summary every 5 minutes
  makeInterval(flushStats, 5 * 60_000);

  // Zoho Cliq: reaviso único para CRIT sem ack após cliqRenotifyMinutes
  makeInterval(() => void trackAsync(checkRenotify()), 60_000);

  // Chamado por e-mail para link fora há mais de ticketAfterMinutes (Sistema → Chamado automático)
  makeInterval(() => void trackAsync(checkLinkTickets()), 60_000);

  // Reconcile device list every 30s: add new, remove deleted, reschedule updated
  // Uses a lean select for change detection; fetches full device only when needed.
  makeInterval(async () => {
    const snapshots = await db.device.findMany({
      select: { id: true, name: true, updatedAt: true },
    });
    const currentIds = new Set(snapshots.map((d) => d.id));

    for (const id of timers.keys()) {
      if (!currentIds.has(id)) {
        unscheduleDevice(id);
        log("info", "Dispositivo removido do agendador.", { deviceId: id });
      }
    }

    // Collect new/changed devices, then fetch them in a single query (avoids an
    // N+1 of one findUnique per changed device).
    const toReschedule = snapshots
      .map((snap) => {
        const isNew = !timers.has(snap.id);
        const lastUpdatedAt = deviceSnapshots.get(snap.id);
        const configChanged = !!lastUpdatedAt && lastUpdatedAt.getTime() !== snap.updatedAt.getTime();
        return { id: snap.id, isNew, changed: isNew || configChanged };
      })
      .filter((s) => s.changed);

    if (toReschedule.length > 0) {
      const isNewById = new Map(toReschedule.map((s) => [s.id, s.isNew]));
      const devices = await db.device.findMany({ where: { id: { in: toReschedule.map((s) => s.id) } } });
      for (const device of devices) {
        scheduleDevice(device);
        deviceSnapshots.set(device.id, device.updatedAt);
        log("info", isNewById.get(device.id) ? "Novo dispositivo adicionado." : "Dispositivo atualizado, reagendando.", {
          device: device.name,
        });
      }
    }
  }, 30_000);

  makeInterval(() => void trackAsync(pollLinks()), 60_000);

  // Sync Miradore phones on interval (reads interval from config)
  const setupMiradoreSync = async () => {
    const config = await db.systemConfig.findUnique({ where: { id: 1 } }).catch(() => null);
    const intervalMs = (config?.miradoreSyncIntervalMinutes ?? 60) * 60_000;
    makeInterval(() => void trackAsync(syncMiradorePhones()), intervalMs);
    log("info", "Miradore sync interval scheduled", { intervalMinutes: config?.miradoreSyncIntervalMinutes ?? 60 });
  };
  void setupMiradoreSync();

  // Sync Datto RMM computers on interval (reads interval from config)
  const setupDattoSync = async () => {
    const config = await db.systemConfig.findUnique({ where: { id: 1 } }).catch(() => null);
    const intervalMs = (config?.dattoSyncIntervalMinutes ?? 30) * 60_000;
    makeInterval(() => void trackAsync(syncDattoDevices()), intervalMs);
    log("info", "Datto RMM sync interval scheduled", { intervalMinutes: config?.dattoSyncIntervalMinutes ?? 30 });
  };
  void setupDattoSync();
}

export async function pollLinks() {
  const links = await db.link.findMany({
    where: { mikrotikDeviceId: { not: null }, mikrotikInterface: { not: null } },
    include: { mikrotikDevice: true },
  });

  await Promise.allSettled(links.map(runLinkChecks));
}

// Envia RENOTIFY (uma única vez por episódio) para dispositivos/links avisados e sem ack
// há mais de cliqRenotifyMinutes. notify() revalida ack, silêncio e deduplicação.
export async function checkRenotify() {
  try {
    const cfg = await db.systemConfig.findUnique({ where: { id: 1 } });
    if (!cfg?.cliqEnabled) return;
    const boundary = new Date(Date.now() - (cfg.cliqRenotifyMinutes ?? 15) * 60_000);
    const where = {
      cliqNotifiedAt: { lt: boundary },
      cliqRenotifiedAt: null,
      offlineAcknowledgedAt: null,
    };
    const [devices, links] = await Promise.all([
      db.device.findMany({ where }),
      db.link.findMany({ where }),
    ]);
    for (const d of devices) {
      if (!d.cliqNotifiedAt) continue;
      await notify({ kind: "RENOTIFY", entityType: "device", id: d.id, name: d.name, site: d.site, since: d.cliqNotifiedAt });
    }
    for (const l of links) {
      if (!l.cliqNotifiedAt) continue;
      await notify({ kind: "RENOTIFY", entityType: "link", id: l.id, name: l.name, site: l.site, since: l.cliqNotifiedAt });
    }
  } catch (err: unknown) {
    log("error", "[Cliq] checkRenotify falhou", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function pruneHistory() {
  const config = await db.systemConfig.upsert({
    where: { id: 1 },
    create: { id: 1, statusHistoryDays: 30, linkEventDays: 90 },
    update: {},
  });

  const historyCutoff = new Date(Date.now() - config.statusHistoryDays * 24 * 3_600_000);
  const eventCutoff   = new Date(Date.now() - config.linkEventDays   * 24 * 3_600_000);

  const now = new Date();
  const [statusResult, eventResult, blacklistResult] = await Promise.all([
    db.statusHistory.deleteMany({ where: { timestamp: { lt: historyCutoff } } }),
    db.linkEvent.deleteMany({ where: { timestamp: { lt: eventCutoff } } }),
    // SEC-021: purge expired JWT blacklist entries
    db.tokenBlacklist.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  await db.systemConfig.update({ where: { id: 1 }, data: { lastCleanupAt: new Date() } });

  log("info", "[Retenção] registros removidos.", {
    statusHistory: statusResult.count,
    linkEvents: eventResult.count,
    blacklistTokens: blacklistResult.count,
    historyCutoff: historyCutoff.toISOString(),
    eventCutoff: eventCutoff.toISOString(),
  });
}
