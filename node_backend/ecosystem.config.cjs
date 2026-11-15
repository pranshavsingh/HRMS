module.exports = {
  apps: [
    {
      name: "hrms-api",
      script: "src/server.js",
      instances: 4, // 4 PM2 cluster workers matching Hostinger KVM4 vCPU count
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        RUN_CRON_IN_API: "false",
      },
    },
    {
      name: "hrms-worker",
      script: "src/worker.js",
      instances: 1, // Single isolated worker for background cron jobs and queue
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
