import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { dbInfo, healthCheck, closePool } from "./db/index.js";
import { initCron } from "./utils/cron.js";

const app = createApp();

async function startServer() {
  const info = dbInfo();
  console.log(`[DB] Checking connection (${info.client})...`);

  try {
    await healthCheck();
    console.log(`[DB] Connected: mysql://${info.user}@${info.host}:${info.port}/${info.database}`);
    
    // Initialize background cron jobs only in development or if explicitly enabled in API instance
    if (process.env.RUN_CRON_IN_API === "true" || process.env.NODE_ENV !== "production") {
      initCron();
    } else {
      console.log("[CRON] Skipped in API cluster instance (managed by dedicated worker)");
    }
  } catch (error) {
    console.error(`[DB] Connection failed: ${error.message}`);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[APP] Backend listening on port ${config.port}`);

    // Notify PM2 cluster that this worker is ready to receive requests (zero-downtime rolling reload)
    if (typeof process.send === "function") {
      process.send("ready");
    }
  });

  // Enterprise Graceful Shutdown & Connection Draining
  const shutdown = (signal) => {
    console.log(`[APP] Received ${signal}. Draining active connections...`);

    server.close(async () => {
      console.log("[APP] HTTP server stopped accepting connections.");
      try {
        await closePool();
        console.log("[DB] MySQL connection pool drained successfully.");
      } catch (err) {
        console.error("[DB] Error closing connection pool: %s", err.message);
      }
      process.exit(0);
    });

    // Hard ceiling timeout: kill process after 15s if requests hang
    setTimeout(() => {
      console.error("[APP] Could not finish connections in time, forcing exit.");
      process.exit(1);
    }, 15000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer();
