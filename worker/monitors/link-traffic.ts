import { RouterOSAPI } from "routeros";

export interface LinkTrafficResult {
  downloadBps: number;
  uploadBps: number;
}

type Row = Record<string, string>;

// /interface/monitor-traffic doesn't accept =count= via API.
// Instead we read /interface/print rx-byte/tx-byte twice, 1 second apart,
// and compute the delta — same math RouterOS does internally.
export async function checkLinkTraffic(
  ip: string,
  user: string,
  password: string,
  port: number,
  iface: string,
): Promise<LinkTrafficResult> {
  const conn = new RouterOSAPI({ host: ip, user, password, port, timeout: 10000 });
  await conn.connect();

  try {
    const readCounters = async (): Promise<{ rx: number; tx: number }> => {
      const rows = await conn.write("/interface/print", [
        "=.proplist=name,rx-byte,tx-byte",
      ]) as Row[];
      const row = rows.find((r) => r.name === iface);
      if (!row) throw new Error(`Interface "${iface}" não encontrada no dispositivo`);
      return { rx: Number(row["rx-byte"]) || 0, tx: Number(row["tx-byte"]) || 0 };
    };

    const before = await readCounters();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const after = await readCounters();

    return {
      downloadBps: Math.max(0, (after.rx - before.rx) * 8),
      uploadBps:   Math.max(0, (after.tx - before.tx) * 8),
    };
  } finally {
    conn.close();
  }
}
