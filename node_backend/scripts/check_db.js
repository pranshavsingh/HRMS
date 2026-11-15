import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function main() {
  const db = await open({
    filename: path.resolve('db.sqlite3'),
    driver: sqlite3.Database
  });

  console.log('--- USERS ---');
  const users = await db.all("SELECT id, username, role FROM accounts_user");
  console.log(users);

  console.log('--- ATTENDANCE ---');
  const att = await db.all("SELECT * FROM attendance_attendance ORDER BY date DESC LIMIT 10");
  console.log(att);
}

main().catch(console.error);
