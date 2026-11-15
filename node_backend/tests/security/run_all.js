/**
 * Phase 1 Security Test Suite Runner
 * Runs all security regression suites sequentially to guarantee isolation.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const suites = [
  "auth.test.js",
  "jwt.test.js",
  "otp.test.js",
  "rbac.test.js",
  "api_security.test.js"
];

let totalPassed = 0;
let totalFailed = 0;

console.log("\n================================================================================");
console.log(" HRMS PHASE 1 SECURITY HARDENING — AUTOMATED REGRESSION SUITE RUNNER");
console.log("================================================================================\n");

async function runSuite(suiteFile) {
  const fullPath = path.join(__dirname, suiteFile);
  console.log(`\n>>> Executing Suite: ${suiteFile} ...`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", fullPath], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test" }
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[PASS] Suite passed: ${suiteFile}`);
        totalPassed++;
      } else {
        console.error(`[FAIL] Suite failed: ${suiteFile} (exit code ${code})`);
        totalFailed++;
      }
      resolve(code === 0);
    });
  });
}

async function runAll() {
  for (const suite of suites) {
    await runSuite(suite);
  }

  console.log("\n================================================================================");
  console.log(` SUITE SUMMARY: ${totalPassed} Passed, ${totalFailed} Failed (Total ${suites.length} Suites)`);
  console.log("================================================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
