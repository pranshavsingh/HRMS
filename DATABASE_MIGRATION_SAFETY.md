# Database Migration Safety Audit

## 1. Execution Path (`node_backend/docker-entrypoint.sh`)
- `backend` and `worker` share `./node_backend/Dockerfile`.
- `backend` sets `RUN_MIGRATIONS: "true"` and runs `npm run db:migrate` before `exec "$@"`.
- `worker` sets `IS_WORKER: "true"` and `RUN_MIGRATIONS: "false"`, and `depends_on: backend: condition: service_healthy`.
- **Verified in `docker-entrypoint.sh` line 27:** `if [ "$RUN_MIGRATIONS" = "true" ] || [ "$IS_WORKER" != "true" ];` — therefore `worker` **never** runs `db:migrate`; only `backend` runs migrations on startup.

## 2. Concurrency, Idempotency & Integrity (`scripts/run-migrations.js`)
- **Distributed Lock:** Uses MySQL `GET_LOCK('hrms_db_migration_lock', ...)` so concurrent replicas cannot execute migrations simultaneously.
- **Checksum Verification:** Computes SHA-256 of each `.sql` file and compares against `schema_migrations`; if an already-applied migration was tampered with, it aborts with a checksum violation.
- **Fail-Fast Startup:** `set -e` in `docker-entrypoint.sh` ensures that if `npm run db:migrate` fails, the `backend` container exits immediately instead of serving traffic against a broken schema.
- **CI/CD Policy:** Production migrations are **not** run from GitHub Actions runners (MySQL is internal to `hrms_internal_network`); they continue to execute safely inside `backend`'s entrypoint on container startup.
