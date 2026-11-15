import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { dbInfo, healthCheck } from "./db/index.js";
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

  app.listen(config.port, () => {
    console.log(`[APP] Backend listening on port ${config.port}`);
  });
}

startServer();
