/**
 * Ephemeral Test Server Lifecycle Manager for HRMS E2E Test Suite
 * Boots Express instance on ephemeral port 0 and ensures clean teardown.
 */
import { createApp } from "../../../src/app.js";
import { closePool } from "../../../src/db/index.js";
import redisService from "../../../src/services/redis.service.js";
import { closeRealtime } from "../../../src/utils/realtime.js";

/**
 * Boots an ephemeral test server on port 0 (OS allocated).
 * @param {object} options
 * @returns {Promise<{ server: import('http').Server, port: number, baseUrl: string, close: () => Promise<void> }>}
 */
export async function startTestServer(options = {}) {
  const app = createApp();
  
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;
      
      const close = async () => {
        return new Promise((res) => {
          if (typeof server.closeAllConnections === "function") {
            server.closeAllConnections();
          }
          server.close(() => res());
        });
      };

      resolve({ server, port, baseUrl, close });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Global teardown helper for cleaning database and redis socket handles.
 */
export async function teardownAll() {
  try {
    closeRealtime();
  } catch (err) {
    // Ignore realtime close errors on teardown
  }

  try {
    if (redisService?.client) {
      redisService.client.disconnect();
    }
  } catch (err) {
    // Ignore redis disconnect errors on teardown
  }

  try {
    await closePool();
  } catch (err) {
    // Ignore pool close errors on teardown
  }
}
