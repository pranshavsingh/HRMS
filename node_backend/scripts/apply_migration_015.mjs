process.env.DB_CLIENT = "mysql";
process.env.MYSQL_HOST = "127.0.0.1";
process.env.MYSQL_PORT = "3307";
process.env.MYSQL_USER = "root";
process.env.MYSQL_PASSWORD = "";
process.env.MYSQL_DATABASE = "hrms_disposable_test";

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Invoking run-migrations.js with disposable DB environment...");
const runnerPath = path.resolve(__dirname, "run-migrations.js");
const res = spawnSync("node", [runnerPath], {
  env: {
    ...process.env,
    DB_CLIENT: "mysql",
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "3307",
    MYSQL_USER: "root",
    MYSQL_PASSWORD: "",
    MYSQL_DATABASE: "hrms_disposable_test",
  },
  encoding: "utf8",
});

console.log(res.stdout || "");
if (res.stderr) console.error(res.stderr);
if (res.status !== 0) {
  process.exit(res.status);
}
