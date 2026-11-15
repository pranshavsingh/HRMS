/**
 * Phase 3 Distributed Queue & Transactional Outbox Test Runner
 * Runs Phase 3 test suites sequentially with process isolation.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const suites = [
  "phase3/outbox.test.js",
  "phase3/queue.test.js",
  "phase3/otp_outbox.test.js",
  "phase3/failure_injection.test.js",
  "phase3/worker_lifecycle.test.js"
];

let totalPassed = 0;
let totalFailed = 0;

console.log("\n================================================================================");
console.log(" HRMS PHASE 3 DISTRIBUTED QUEUE & TRANSACTIONAL OUTBOX TEST RUNNER");
console.log("================================================================================\n");

async function runSuite(suiteRelPath) {
  const fullPath = path.join(__dirname, suiteRelPath);
  console.log(`\n>>> Executing Suite: ${suiteRelPath} ...`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", fullPath], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test" }
    });

    const timer = setTimeout(() => {
      console.error(`[TIMEOUT] Suite timed out after 90s: ${suiteRelPath}`);
      child.kill("SIGKILL");
    }, 90000);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        console.log(`[PASS] Suite passed: ${suiteRelPath}`);
        totalPassed++;
      } else {
        console.error(`[FAIL] Suite failed: ${suiteRelPath} (exit code ${code})`);
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
