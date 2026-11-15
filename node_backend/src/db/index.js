import mysql from "mysql2/promise";
import { config } from "../config/env.js";

const pool = mysql.createPool({
  host: config.mysqlHost,
  port: config.mysqlPort,
  user: config.mysqlUser,
  password: config.mysqlPassword,
  database: config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: config.mysqlConnectionLimit,
  queueLimit: 200,
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
    const [rows] = await executor.execute(sql, params);
    return rows[0] || undefined;
  },

  /**
   * Execute query and get all rows.
   */
  async all(sql, params = [], tx = null) {
    const executor = tx || pool;
    const [rows] = await executor.execute(sql, params);
    return rows;
  },

  /**
   * Execute a data-modifying query (INSERT/UPDATE/DELETE).
   */
  async run(sql, params = [], tx = null) {
    const executor = tx || pool;
    const [result] = await executor.execute(sql, params);
    return { lastID: result.insertId, changes: result.affectedRows };
  },

  /**
   * Execute code block in a transaction.
   * @param {function(object): Promise<any>} fn - Callback to execute. Recieves the database connection (tx).
   */
  async transaction(fn) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
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
  };
}
