import * as snmp from "net-snmp";
import { log } from "../../lib/logger";

export interface SnmpResult {
  cpuLoad: number | null;
  memoryUsed: number | null;
  uptime: number | null;
}

const OID_CPU_LOAD = "1.3.6.1.2.1.25.3.3.1.2.1";
const OID_SYSUPTIME = "1.3.6.1.2.1.1.3.0";
const OID_STORAGE_USED = "1.3.6.1.2.1.25.2.3.1.6.65536";
const OID_STORAGE_SIZE = "1.3.6.1.2.1.25.2.3.1.5.65536";

function getOids(
  session: snmp.Session,
  oids: string[]
): Promise<Map<string, number>> {
  return new Promise((resolve, reject) => {
    const results = new Map<string, number>();
    session.get(oids, (error, varbinds) => {
      // A request-level error (timeout, no response) means the device is unreachable
      // via SNMP — surface it instead of silently returning an empty result set.
      if (error) return reject(error);
      if (varbinds) {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            results.set(vb.oid, Number(vb.value));
          }
        }
      }
      resolve(results);
    });
  });
}

export async function checkSnmp(
  ip: string,
  community: string = "public",
  port: number = 161
): Promise<SnmpResult> {
  const session = snmp.createSession(ip, community, {
    port,
    timeout: 5000,
    retries: 1,
    version: snmp.Version2c,
  });

  try {
    const values = await getOids(session, [
      OID_CPU_LOAD,
      OID_SYSUPTIME,
      OID_STORAGE_USED,
      OID_STORAGE_SIZE,
    ]);

    const uptimeTicks = values.get(OID_SYSUPTIME);
    const uptime = uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null;

    const cpuLoad = values.get(OID_CPU_LOAD) ?? null;

    const storageUsed = values.get(OID_STORAGE_USED);
    const storageSize = values.get(OID_STORAGE_SIZE);
    const memoryUsed =
      storageUsed != null && storageSize != null && storageSize > 0
        ? (storageUsed / storageSize) * 100
        : null;

    return { cpuLoad, memoryUsed, uptime };
  } catch (err) {
    // SNMP is metrics-only (não afeta isOnline); log the failure for observability
    // but keep returning nulls so the contract stays "always resolves a result".
    log("warn", "[SNMP] consulta falhou", { ip, error: err instanceof Error ? err.message : String(err) });
    return { cpuLoad: null, memoryUsed: null, uptime: null };
  } finally {
    session.close();
  }
}
