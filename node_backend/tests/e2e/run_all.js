/**
 * Master E2E Test Runner for HRMS Phase 4 Hardening
 * Executes 4-tier opaque-box test suites with process isolation,
 * CLI argument filtering (--tier=1..4), colored reporting, and execution timings.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI Color Helpers
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

const tiers = {
  1: {
    name: "Tier 1: Feature Coverage (Core Contracts)",
    suites: [
      "tier1_features/t1_01_web_auth_cookie.test.js",
      "tier1_features/t1_02_mobile_auth_bearer.test.js",
      "tier1_features/t1_03_web_silent_refresh.test.js",
      "tier1_features/t1_04_mobile_json_refresh.test.js",
      "tier1_features/t1_05_rtr_atomic_rotation.test.js",
      "tier1_features/t1_06_rtr_grace_window.test.js",
      "tier1_features/t1_07_hardened_logout.test.js",
      "tier1_features/t1_08_sse_stream_auth.test.js",
      "tier1_features/t1_09_web_auth_context.test.js",
      "tier1_features/t1_10_web_axios_mutex.test.js",
      "tier1_features/t1_11_mobile_secure_store.test.js",
      "tier1_features/t1_12_mobile_lifecycle_appstate.test.js",
      "tier1_features/t1_13_mobile_navigation_modals.test.js",
      "tier1_features/t1_14_api_env_configuration.test.js",
      "tier1_features/t1_15_error_resilience_rbac.test.js"
    ]
  },
  2: {
    name: "Tier 2: Boundary & Corner Cases",
    suites: [
      "tier2_boundaries/t2_01_expired_tokens.test.js",
      "tier2_boundaries/t2_02_malformed_headers_cookies.test.js",
      "tier2_boundaries/t2_03_concurrent_401_storms.test.js",
      "tier2_boundaries/t2_04_clock_skew_grace_limits.test.js",
      "tier2_boundaries/t2_05_network_disconnects_timeouts.test.js",
      "tier2_boundaries/t2_06_payload_boundary_credentials.test.js",
      "tier2_boundaries/t2_07_permission_boundary_roles.test.js",
      "tier2_boundaries/t2_08_cross_tenant_isolation.test.js"
    ]
  },
  3: {
    name: "Tier 3: Cross-Feature Combinations & Pairwise Races",
    suites: [
      "tier3_pairwise/t3_01_web_cookie_refresh_logout.test.js",
      "tier3_pairwise/t3_02_mobile_bearer_rotation_resume.test.js",
      "tier3_pairwise/t3_03_password_change_active_session.test.js",
      "tier3_pairwise/t3_04_sse_stream_token_expiry_reconnect.test.js",
      "tier3_pairwise/t3_05_multitab_web_concurrent_refresh.test.js",
      "tier3_pairwise/t3_06_mobile_network_drop_during_refresh.test.js",
      "tier3_pairwise/t3_07_cross_role_upload_revocation.test.js",
      "tier3_pairwise/t3_08_dual_client_single_logout.test.js",
      "tier3_pairwise/t3_09_replay_attack_family_destruction.test.js",
      "tier3_pairwise/t3_10_rapid_modal_navigation_in_flight.test.js"
    ]
  },
  4: {
    name: "Tier 4: Real-World Application Workflows",
    suites: [
      "tier4_scenarios/t4_01_web_onboarding_lifecycle.test.js",
      "tier4_scenarios/t4_02_mobile_field_worker_day.test.js",
      "tier4_scenarios/t4_03_admin_role_revocation_realtime.test.js",
      "tier4_scenarios/t4_04_multi_device_concurrency_stress.test.js",
      "tier4_scenarios/t4_05_breach_replay_family_destruction.test.js",
      "tier4_scenarios/t4_06_server_recovery_resilience.test.js"
    ]
  }
};

// Parse command line arguments
let selectedTier = null;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--tier=")) {
    selectedTier = parseInt(arg.split("=")[1], 10);
  }
}

async function runSuite(suiteRelPath) {
  const fullPath = path.join(__dirname, suiteRelPath);
  const suiteName = path.basename(suiteRelPath);
  const startTime = Date.now();

  console.log(`\n${c.cyan}▶ Executing Suite:${c.reset} ${suiteRelPath}`);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", fullPath], {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "test",
        MYSQL_CONNECTION_LIMIT: process.env.MYSQL_CONNECTION_LIMIT || "10"
      }
    });

    const timer = setTimeout(() => {
      console.error(`${c.red}✖ [TIMEOUT] Suite exceeded 120s limit: ${suiteRelPath}${c.reset}`);
      child.kill("SIGKILL");
    }, 120000);

    child.on("close", (code) => {
      clearTimeout(timer);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`${c.green}✔ [PASS]${c.reset} ${suiteName} (${duration}s)`);
        resolve({ passed: true, duration });
      } else {
        console.error(`${c.red}✖ [FAIL]${c.reset} ${suiteName} (exit code ${code}, ${duration}s)`);
        resolve({ passed: false, duration });
      }
    });
  });
}

async function main() {
  const globalStart = Date.now();
  console.log(`\n${c.bright}${c.blue}================================================================================${c.reset}`);
  console.log(`${c.bright}${c.blue}  HRMS PHASE 4 E2E MASTER TEST RUNNER (Node.js ${process.version})${c.reset}`);
  console.log(`${c.bright}${c.blue}================================================================================${c.reset}\n`);

  const activeTiers = selectedTier ? [selectedTier] : [1, 2, 3, 4];
  const summary = {};

  let globalPassed = 0;
  let globalFailed = 0;

  for (const tierNum of activeTiers) {
    const tierDef = tiers[tierNum];
    if (!tierDef) {
      console.error(`${c.red}Unknown tier: ${tierNum}${c.reset}`);
      process.exit(1);
    }

    console.log(`\n${c.bright}${c.yellow}================================================================================${c.reset}`);
    console.log(`${c.bright}${c.yellow}  ${tierDef.name}${c.reset}`);
    console.log(`${c.bright}${c.yellow}================================================================================${c.reset}`);

    summary[tierNum] = { passed: 0, failed: 0, total: tierDef.suites.length };

    for (const suite of tierDef.suites) {
      const result = await runSuite(suite);
      if (result.passed) {
        summary[tierNum].passed++;
        globalPassed++;
      } else {
        summary[tierNum].failed++;
        globalFailed++;
      }
    }
  }

  const totalTime = ((Date.now() - globalStart) / 1000).toFixed(2);

  console.log(`\n${c.bright}${c.blue}================================================================================${c.reset}`);
  console.log(`${c.bright}${c.blue}  E2E TEST RUN SUMMARY (${totalTime}s)${c.reset}`);
  console.log(`${c.bright}${c.blue}================================================================================${c.reset}`);

  for (const tierNum of activeTiers) {
    const s = summary[tierNum];
    const statusColor = s.failed === 0 ? c.green : c.red;
    console.log(`  Tier ${tierNum}: ${statusColor}${s.passed} Passed, ${s.failed} Failed${c.reset} / ${s.total} Suites`);
  }

  console.log(`\n  Total Suites Executed: ${globalPassed + globalFailed}`);
  console.log(`  Overall Status: ${globalFailed === 0 ? `${c.green}${c.bright}PASSED (100%)${c.reset}` : `${c.red}${c.bright}FAILED (${globalFailed} suite failures)${c.reset}`}\n`);

  if (globalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Runner encountered fatal error:", err);
  process.exit(1);
});
