import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { dbInfo, healthCheck, closePool } from "./db/index.js";
import { initCron } from "./utils/cron.js";
import realtimeService from "./services/realtime.service.js";

const app = createApp();

async function startServer() {
  const info = dbInfo();
  console.log(`[DB] Checking connection (${info.client})...`);

  try {
    await healthCheck();
    console.log(`[DB] Connected: mysql://${info.user}@${info.host}:${info.port}/${info.database}`);
    
    // Background cron jobs run exclusively in the dedicated background worker process
    if (process.env.RUN_CRON_IN_API === "true") {
      initCron();
      console.log("[CRON] Initialized in API instance (RUN_CRON_IN_API=true)");
    } else {
      console.log("[CRON] Skipped in API cluster instance (managed exclusively by dedicated background worker)");
    }
  } catch (error) {
    console.error(`[DB] Connection failed: ${error.message}`);
    process.exit(1);
  }

  const server = app.listen(config.port, async () => {
    console.log(`[APP] Backend listening on port ${config.port}`);

    // Initialize distributed realtime Socket.IO service
    try {
      await realtimeService.init(server);
    } catch (err) {
      console.warn(`[Realtime] Warning during realtime initialization: ${err.message}`);
    }

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
        await realtimeService.close();
      } catch (err) {
        console.warn(`[Realtime] Error during close: ${err.message}`);
      }
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
