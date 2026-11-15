import { verifyDjangoPassword, makeNodePassword } from "../src/utils/auth.js";
import { db } from "../src/db/index.js";

async function run() {
  const rawPassword = "password123";
  const hash = makeNodePassword(rawPassword);
  console.log("Generated hash:", hash);

  const ok = verifyDjangoPassword(rawPassword, hash);
  console.log("verifyDjangoPassword verify:", ok);

  try {
    const user = await db.get("SELECT * FROM accounts_user WHERE username='hr1'");
    if (user) {
      console.log("User hr1 found, DB hash:", user.password);
      const dbOk = verifyDjangoPassword(rawPassword, user.password);
      console.log("Verify against DB hash:", dbOk);
    } else {
      console.log("User hr1 not found in DB");
    }
  } catch (err) {
    console.error("Database query failed:", err);
  }

  process.exit(0);
}

run();
