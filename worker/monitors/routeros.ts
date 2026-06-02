import RouterOS from "routeros";

export interface RouterOSResult {
  uptime: number | null;
  cpuLoad: number | null;
  memoryUsed: number | null;
}

function parseUptime(str: string): number {
  const weeks = parseInt(str.match(/(\d+)w/)?.[1] ?? "0");
  const days = parseInt(str.match(/(\d+)d/)?.[1] ?? "0");
  const hours = parseInt(str.match(/(\d+)h/)?.[1] ?? "0");
  const mins = parseInt(str.match(/(\d+)m/)?.[1] ?? "0");
  const secs = parseInt(str.match(/(\d+)s/)?.[1] ?? "0");

  return weeks * 604800 + days * 86400 + hours * 3600 + mins * 60 + secs;
}

export async function checkRouterOS(
  ip: string,
  username: string,
  password: string,
  port: number = 8728
): Promise<RouterOSResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ROS = RouterOS as any;
  const ClientClass = ROS.RouterOSClient ?? ROS.default?.RouterOSClient ?? ROS;

  const client = new ClientClass({
    host: ip,
    user: username,
    password,
    port,
    timeout: 8000,
  });

  try {
    await client.connect();
    const api = client.api();
    const [resourceData] = await api.write("/system/resource/print");
    await client.disconnect();

    const uptime = resourceData?.["uptime"]
      ? parseUptime(String(resourceData["uptime"]))
      : null;

    const cpuLoad =
      resourceData?.["cpu-load"] != null
        ? Number(resourceData["cpu-load"])
        : null;

    const totalMem = Number(resourceData?.["total-memory"] ?? 0);
    const freeMem = Number(resourceData?.["free-memory"] ?? 0);
    const memoryUsed = totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : null;

    return { uptime, cpuLoad, memoryUsed };
  } catch {
    try {
      await client.disconnect();
    } catch {}
    return { uptime: null, cpuLoad: null, memoryUsed: null };
  }
}
