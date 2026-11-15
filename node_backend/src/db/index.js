import mysql from "mysql2/promise";
import { performance } from "perf_hooks";
import { config } from "../config/env.js";
import logger from "../utils/logger.js";

const SLOW_QUERY_THRESHOLD_MS = 200;

function sanitizeSqlForLogging(sql) {
  return String(sql).replace(/\s+/g, " ").trim().slice(0, 500);
}

async function measureQuery(fn, sql) {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn(
        `[SLOW QUERY DETECTED] Duration: ${duration.toFixed(2)}ms | SQL: ${sanitizeSqlForLogging(sql)}`
      );
    }
  }
}

const pool = mysql.createPool({
  host: config.mysqlHost,
  port: config.mysqlPort,
  user: config.mysqlUser,
  password: config.mysqlPassword,
  database: config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: config.mysqlConnectionLimit,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  multipleStatements: false,
  timezone: "Z",
});

export const db = {
  /**
   * Execute query and get a single row.
   */
  async get(sql, params = [], tx = null) {
    const executor = tx || pool;
    return measureQuery(async () => {
      const [rows] = await executor.execute(sql, params);
      return rows[0] || undefined;
    }, sql);
  },

  /**
   * Execute query and get all rows.
   */
  async all(sql, params = [], tx = null) {
    const executor = tx || pool;
    return measureQuery(async () => {
      const [rows] = await executor.execute(sql, params);
      return rows;
    }, sql);
  },

  /**
   * Execute a data-modifying query (INSERT/UPDATE/DELETE).
   */
  async run(sql, params = [], tx = null) {
    const executor = tx || pool;
    return measureQuery(async () => {
      const [result] = await executor.execute(sql, params);
      return { lastID: result.insertId, changes: result.affectedRows };
    }, sql);
  },

  /**
   * Execute code block in a transaction with automatic retry on deadlocks.
   * @param {function(object): Promise<any>} fn - Callback to execute. Receives the database connection (tx).
   * @param {number} maxRetries - Maximum retries on deadlock (default: 3).
   */
  async transaction(fn, maxRetries = 3) {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await fn(connection);
        await connection.commit();
        return result;
      } catch (err) {
        await connection.rollback();
        const isDeadlock =
          err.errno === 1213 ||
          err.code === "ER_LOCK_DEADLOCK" ||
          (err.message && err.message.includes("Deadlock found"));
        if (isDeadlock && attempts < maxRetries) {
          const delay = Math.floor(Math.random() * 50) + 20;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      } finally {
        connection.release();
      }
    }
  }
};

export async function healthCheck() {
  await pool.query("SELECT 1");
}

export async function closePool() {
  await pool.end();
}

export function dbInfo() {
  return {
    client: "mysql",
    host: config.mysqlHost,
    port: config.mysqlPort,
    database: config.mysqlDatabase,
    user: config.mysqlUser,
    connectionLimit: config.mysqlConnectionLimit,
  };
}

export function getPoolMetrics() {
  const p = pool?.pool;
  if (!p) {
    return {
      total: 0,
      free: 0,
      active: 0,
      queued: 0,
      limit: config.mysqlConnectionLimit || 30,
    };
  }
  const total = Array.isArray(p._allConnections) ? p._allConnections.length : 0;
  const free = Array.isArray(p._freeConnections) ? p._freeConnections.length : 0;
  const queued = Array.isArray(p._connectionQueue) ? p._connectionQueue.length : 0;
  return {
    total,
    free,
    active: Math.max(0, total - free),
    queued,
    limit: config.mysqlConnectionLimit || 30,
  };
}
