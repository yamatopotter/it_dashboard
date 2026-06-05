type Level = "info" | "warn" | "error";

export function log(level: Level, msg: string, ctx?: Record<string, unknown>): void {
  const entry = JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() });
  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}
