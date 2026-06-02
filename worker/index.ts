import { startScheduler } from "./scheduler";

process.on("uncaughtException", (err) => {
  console.error("[worker] Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] Unhandled rejection:", reason);
});

startScheduler().catch((err) => {
  console.error("[worker] Falha ao iniciar scheduler:", err);
  process.exit(1);
});
