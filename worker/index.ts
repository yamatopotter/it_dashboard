import "dotenv/config";
import { validateKey } from "../lib/crypto";
import { validateSecret } from "../lib/webhook";
import { startScheduler, shutdown } from "./scheduler";
import { db } from "../lib/db";
import { log } from "../lib/logger";

// Fail fast if required secrets are missing before any polling starts
validateKey();
validateSecret();

async function gracefulShutdown(signal: string) {
  log("info", `Worker recebeu ${signal}, drenando operações em andamento...`);
  await shutdown();
  await db.$disconnect();
  log("info", "Worker encerrado com sucesso.");
  process.exit(0);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });
process.on("SIGINT",  () => { void gracefulShutdown("SIGINT"); });

process.on("uncaughtException", (err) => {
  log("error", "[worker] Uncaught exception", { error: err.message });
});

process.on("unhandledRejection", (reason) => {
  log("error", "[worker] Unhandled rejection", { reason: String(reason) });
});

const STARTUP_TIMEOUT_MS = 30_000;
const startupTimer = setTimeout(() => {
  log("error", "[worker] Timeout de inicialização atingido (30s). Encerrando.");
  process.exit(1);
}, STARTUP_TIMEOUT_MS);
if (typeof startupTimer === "object" && startupTimer !== null && "unref" in startupTimer) {
  (startupTimer as NodeJS.Timeout).unref();
}

startScheduler()
  .then(() => clearTimeout(startupTimer))
  .catch((err) => {
    clearTimeout(startupTimer);
    log("error", "[worker] Falha ao iniciar scheduler", { error: String(err) });
    process.exit(1);
  });
