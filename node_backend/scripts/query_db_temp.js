import { db } from "../src/db/index.js";
import { dbInfo } from "../src/db/index.js";

async function run() {
  console.log("DB Info:", dbInfo());
  try {
    const users = await db.all("SELECT id, username, role, is_superuser, is_active FROM accounts_user");
    console.log("Active Users & Roles:", users);
  } catch (err) {
    console.error("Error querying db:", err);
  }
  process.exit(0);
}

run();
