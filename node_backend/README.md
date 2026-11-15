# HRMS Node Backend

## MySQL (Hostinger) Setup

1. In Hostinger `Remote MySQL`, allow your server/public IP (or `%` if needed).
2. Copy `.env.example` to `.env` and fill:
   - `DB_CLIENT=mysql`
   - `MYSQL_HOST`
   - `MYSQL_PORT`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `MYSQL_DATABASE`
3. Install deps: `npm install`
4. Create schema: `npm run db:init:mysql`
5. Migrate data from sqlite: `npm run db:migrate:sqlite-to-mysql`
6. Start backend: `npm run dev`

## SQLite fallback

- Set `DB_CLIENT=sqlite` and `DB_PATH=./db.sqlite3`