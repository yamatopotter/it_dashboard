import "dotenv/config";
import { validateKey } from "../lib/crypto";
import { startScheduler } from "./scheduler";

// Fail fast if required secrets are missing before any polling starts
validateKey();

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
