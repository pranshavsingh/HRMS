#!/usr/bin/env node
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");

const envPath = path.join(__dirname, "../.env");

console.log("[Tunnel] Initializing automated tunnel script...");

// 1. Check if backend is running on port 8000
const backendCheck = net.connect({ port: 8000, host: "127.0.0.1" }, () => {
  console.log("✔ Backend is active on http://127.0.0.1:8000");
  backendCheck.end();
});

backendCheck.on("error", () => {
  console.warn("\x1b[33m%s\x1b[0m", "⚠️  WARNING: Backend server does not appear to be running on port 8000.");
  console.warn("\x1b[33m%s\x1b[0m", "   Please ensure you run the backend using 'npm run dev' or 'node src/server.js' in the node_backend folder.");
});

// 2. Start localhost.run SSH tunnel
console.log("[Tunnel] Starting localhost.run SSH tunnel...");
const ssh = spawn("ssh", [
  "-o", "StrictHostKeyChecking=no",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
  "-R", "80:localhost:8000",
  "nokey@localhost.run"
], { shell: true });

let tunnelUrlFound = false;

ssh.stdout.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(output); // Print ssh output to console so user can see it

  if (tunnelUrlFound) return;

  // Regex to match a URL like https://3c199cf8fbc618.lhr.life or https://*.lhr.life
  const match = output.match(/(https:\/\/[a-zA-Z0-9.-]+\.lhr\.life)/);
  if (match) {
    const url = match[1];
    const apiUrl = `${url}/api`;
    console.log(`\n\x1b[32m[Tunnel] Found tunnel URL: ${url}\x1b[0m`);
    console.log(`\x1b[32m[Tunnel] API URL will be: ${apiUrl}\x1b[0m`);

    tunnelUrlFound = true;
    updateEnv(apiUrl);
  }
});

ssh.stderr.on("data", (data) => {
  console.error(`[Tunnel SSH Error] ${data.toString()}`);
});

ssh.on("close", (code) => {
  console.log(`[Tunnel] Tunnel SSH connection closed with code ${code}`);
  process.exit(code);
});

const tunnelOnly = process.argv.includes("--tunnel-only");

// 3. Update the .env file with the new URL
function updateEnv(apiUrl) {
  try {
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    // Split into lines, filter out any existing EXPO_PUBLIC_API_URL definitions (active or commented)
    let lines = envContent.split(/\r?\n/).filter(line => !line.includes("EXPO_PUBLIC_API_URL="));
    
    // Append the new active API URL definition
    lines.push(`EXPO_PUBLIC_API_URL=${apiUrl}`);
    
    envContent = lines.join("\n");

    fs.writeFileSync(envPath, envContent, "utf8");
    console.log("✔ Updated hrms_mobile/.env with the new API URL!");

    // 4. Start Expo if not in tunnel-only mode
    if (!tunnelOnly) {
      startExpo();
    } else {
      console.log("\n\x1b[36m[Tunnel] Running in tunnel-only mode. You can start/restart Metro separately.\x1b[0m");
      console.log("\x1b[36m[Tunnel] Keeping SSH tunnel active. Press Ctrl+C to terminate.\x1b[0m\n");
    }
  } catch (err) {
    console.error("❌ Failed to update hrms_mobile/.env file:", err.message);
    cleanupAndExit(1);
  }
}

// 5. Spawn the Expo bundler
function startExpo() {
  console.log("[Expo] Starting Metro Bundler with cleared cache (npx expo start -c)...");
  
  const expo = spawn("npx", ["expo", "start", "-c"], {
    stdio: "inherit",
    shell: true,
    cwd: path.join(__dirname, "..")
  });

  expo.on("close", (code) => {
    console.log(`[Expo] Metro Bundler process exited with code ${code}`);
    cleanupAndExit(code);
  });
}

function cleanupAndExit(code) {
  console.log("[Tunnel] Cleaning up SSH tunnel process...");
  try {
    ssh.kill();
  } catch (e) {}
  process.exit(code);
}

// Handle termination signals
process.on("SIGINT", () => cleanupAndExit(0));
process.on("SIGTERM", () => cleanupAndExit(0));
