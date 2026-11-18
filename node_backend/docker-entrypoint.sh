#!/bin/sh
set -e

# Wait for MySQL connection if MYSQL_HOST is configured
if [ -n "$MYSQL_HOST" ]; then
  echo "[Entrypoint] Waiting for MySQL ($MYSQL_HOST:${MYSQL_PORT:-3306})..."
  until node -e "
    import('mysql2/promise').then(({ default: mysql }) => {
      return mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        connectTimeout: 3000
      });
    }).then(conn => { conn.end(); process.exit(0); })
      .catch(() => process.exit(1));
  " 2>/dev/null; do
    echo "[Entrypoint] MySQL is not ready yet - waiting 2 seconds..."
    sleep 2
  done
  echo "[Entrypoint] MySQL connection verified."
fi

# Run schema initialization & migrations on the API service (skip in worker)
if [ "$RUN_MIGRATIONS" = "true" ] || [ "$IS_WORKER" != "true" ]; then
  echo "[Entrypoint] Verifying base schema..."
  npm run db:init:mysql || true

  echo "[Entrypoint] Applying pending database migrations..."
  npm run db:migrate
fi

echo "[Entrypoint] Starting application process: $@"
exec "$@"
