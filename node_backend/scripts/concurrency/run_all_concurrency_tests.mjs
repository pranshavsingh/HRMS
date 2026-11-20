import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [
  { name: "C-01: Roster Publishing Race", script: "test_c01_roster_publish_race.mjs" },
  { name: "C-02: Roster Draft Edit vs Publishing Collision", script: "test_c02_roster_edit_publish_race.mjs" },
  { name: "C-03: Punch-In vs Punch-Out Attribution Race", script: "test_c03_punch_in_out_race.mjs" },
  { name: "C-04: Fixed Assignment vs Rotation Enrollment Collision", script: "test_c04_assignment_rotation_conflict.mjs" },
  { name: "C-05: Exception Resolution Collision", script: "test_c05_exception_resolution_race.mjs" },
  { name: "C-06: Deadlock Avoidance via Ascending ID Sorting", script: "test_c06_deadlock_avoidance_ordering.mjs" },
];

console.log("================================================================================");
console.log("HRMS MULTI-CLIENT CONCURRENCY TEST SUITE (C-01 THROUGH C-06)");
console.log("Database Target: MariaDB 11.8.9 (127.0.0.1:3307)");
console.log("================================================================================");

let passedCount = 0;
const results = [];

for (const t of tests) {
  console.log(`\n>>> RUNNING TEST: ${t.name} (${t.script})...`);
  const scriptPath = path.resolve(__dirname, t.script);
  try {
    const output = execSync(`node "${scriptPath}"`, { encoding: "utf8" });
    console.log(output);
    results.push({ name: t.name, script: t.script, status: "PASS" });
    passedCount++;
  } catch (err) {
    console.error(`FAILED: ${t.name}`);
    console.error(err.stdout || err.message);
    results.push({ name: t.name, script: t.script, status: "FAIL", error: err.message });
  }
}

console.log("\n================================================================================");
console.log("CONCURRENCY SUITE SUMMARY");
console.log("================================================================================");
console.log(`Total: ${tests.length} | Passed: ${passedCount} | Failed: ${tests.length - passedCount}`);
results.forEach(r => {
  const icon = r.status === "PASS" ? "✅" : "❌";
  console.log(`${icon} [${r.script}] ${r.name}`);
});

if (passedCount !== tests.length) {
  process.exit(1);
}
