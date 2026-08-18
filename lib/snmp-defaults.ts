export interface SnmpOidEntry {
  key: string;        // identifier — "cpu" | "uptime" | "memory" map to dedicated DB columns
  label: string;      // display name shown in UI
  oid: string;        // primary OID to query
  oidTotal?: string;  // second OID for ratio metrics: value = (oid / oidTotal) * 100
  divisor?: number;   // numeric scale: value = raw / divisor (e.g. uptime ticks → seconds)
  unit: string;       // display unit shown after the value
  enabled: boolean;
}

// OIDs padrão — compatíveis com a maioria dos servidores SNMP
export const DEFAULT_SNMP_OIDS: SnmpOidEntry[] = [
  {
    key:     "cpu",
    label:   "CPU",
    oid:     "1.3.6.1.2.1.25.3.3.1.2.1",
    unit:    "%",
    enabled: true,
  },
  {
    key:     "uptime",
    label:   "Uptime",
    oid:     "1.3.6.1.2.1.1.3.0",
    divisor: 100,
    unit:    "s",
    enabled: true,
  },
  {
    key:      "memory",
    label:    "Memória",
    oid:      "1.3.6.1.2.1.25.2.3.1.6.65536",
    oidTotal: "1.3.6.1.2.1.25.2.3.1.5.65536",
    unit:     "%",
    enabled:  true,
  },
];

// OIDs específicos para Intelbras NVR/DVR
// Se os OIDs padrão não funcionarem, tente:
// - Community: public (padrão, mas pode estar mudado)
// - CPU: 1.3.6.1.4.1.7597.7.1.1.3 (Intelbras-specific)
// - HDD: 1.3.6.1.4.1.7597.7.1.1.4
// Troubleshooting:
//   1. Verifique se SNMP está habilitado nas configurações do NVR
//   2. Confirme a community string (padrão é "public")
//   3. Verifique se a porta 161 está aberta no firewall
//   4. Teste com: snmpget -v 2c -c public <IP> 1.3.6.1.2.1.1.1.0
export const INTELBRAS_SNMP_OIDS: SnmpOidEntry[] = [
  {
    key:     "cpu",
    label:   "CPU",
    oid:     "1.3.6.1.4.1.7597.7.1.1.3",
    unit:    "%",
    enabled: true,
  },
  {
    key:     "uptime",
    label:   "Uptime",
    oid:     "1.3.6.1.2.1.1.3.0",
    divisor: 100,
    unit:    "s",
    enabled: true,
  },
];

/** Returns the effective OID config for a device — stored config or defaults. */
export function resolveSnmpOids(stored: unknown): SnmpOidEntry[] {
  if (Array.isArray(stored) && stored.length > 0) return stored as SnmpOidEntry[];
  return DEFAULT_SNMP_OIDS;
}
