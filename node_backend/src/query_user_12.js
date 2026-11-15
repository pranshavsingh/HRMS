import { db } from "./db/index.js";

async function run() {
  try {
    const user = await db.get("SELECT * FROM accounts_user WHERE id = ?", [12]);
    console.log("USER 12 DETAILS:", JSON.stringify(user, null, 2));
  } catch (err) {
    console.error("Query failed:", err);
  }
  process.exit(0);
}
run();
