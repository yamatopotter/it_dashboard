import ping from "ping";

export interface PingResult {
  alive: boolean;
  responseMs: number | null;
}

export async function checkPing(ip: string): Promise<PingResult> {
  try {
    const result = await ping.promise.probe(ip, {
      timeout: 5,
      extra: ["-c", "1"],
    });

    const alive = result.alive;
    const timeVal = result.time;
    const responseMs =
      alive && String(timeVal) !== "unknown" && !isNaN(Number(timeVal))
        ? Math.round(Number(timeVal))
        : null;

    return { alive, responseMs };
  } catch {
    return { alive: false, responseMs: null };
  }
}
