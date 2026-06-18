import * as snmp from "net-snmp";
import { log } from "../../lib/logger";
import { type SnmpOidEntry, DEFAULT_SNMP_OIDS } from "../../lib/snmp-defaults";

export interface SnmpResult {
  cpuLoad:    number | null;
  memoryUsed: number | null;
  uptime:     number | null;
  snmpData:   Record<string, number | null>;
}

function getOids(
  session: snmp.Session,
  oids: string[]
): Promise<Map<string, number>> {
  return new Promise((resolve, reject) => {
    const results = new Map<string, number>();
    session.get(oids, (error, varbinds) => {
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
  port: number = 161,
  oidConfig: SnmpOidEntry[] = DEFAULT_SNMP_OIDS,
): Promise<SnmpResult> {
  const session = snmp.createSession(ip, community, {
    port,
    timeout: 5000,
    retries: 1,
    version: snmp.Version2c,
  });

  try {
    const enabled = oidConfig.filter((e) => e.enabled);

    // Collect all unique OIDs to query in one request
    const oidsToQuery = new Set<string>();
    for (const entry of enabled) {
      oidsToQuery.add(entry.oid);
      if (entry.oidTotal) oidsToQuery.add(entry.oidTotal);
    }

    const raw = await getOids(session, [...oidsToQuery]);

    const snmpData: Record<string, number | null> = {};
    let cpuLoad:    number | null = null;
    let memoryUsed: number | null = null;
    let uptime:     number | null = null;

    for (const entry of enabled) {
      const primary = raw.get(entry.oid) ?? null;
      let value: number | null = null;

      if (primary !== null) {
        if (entry.oidTotal) {
          // Ratio metric: value = (primary / total) * 100
          const total = raw.get(entry.oidTotal) ?? null;
          value = total != null && total > 0
            ? (primary / total) * 100
            : null;
        } else if (entry.divisor != null && entry.divisor > 0) {
          value = primary / entry.divisor;
        } else {
          value = primary;
        }
      }

      snmpData[entry.key] = value;

      // Map well-known keys to dedicated DeviceStatus columns
      if (entry.key === "cpu")    cpuLoad    = value;
      if (entry.key === "memory") memoryUsed = value;
      if (entry.key === "uptime") uptime     = value != null ? Math.floor(value) : null;
    }

    return { cpuLoad, memoryUsed, uptime, snmpData };
  } catch (err) {
    log("warn", "[SNMP] consulta falhou", { ip, error: err instanceof Error ? err.message : String(err) });
    return { cpuLoad: null, memoryUsed: null, uptime: null, snmpData: {} };
  } finally {
    session.close();
  }
}
