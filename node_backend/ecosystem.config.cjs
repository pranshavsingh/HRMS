module.exports = {
  apps: [
    {
      name: "hrms-api",
      script: "src/server.js",
      instances: 4, // 4 PM2 cluster workers matching Hostinger KVM4 vCPU count
      exec_mode: "cluster",
      watch: false,
      wait_ready: true, // Enables zero-downtime rolling reloads via process.send('ready')
      listen_timeout: 10000,
      kill_timeout: 15000, // Allows up to 15s for in-flight requests to drain before SIGKILL
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        RUN_CRON_IN_API: "false",
      },
    },
    {
      name: "hrms-worker",
      script: "src/worker.js",
      instances: 1, // Single dedicated background worker for outbox dispatch, BullMQ queues, and cron jobs
      exec_mode: "fork",
      watch: false,
      wait_ready: true, // Enables PM2 deterministic startup confirmation via process.send('ready')
      listen_timeout: 10000,
      kill_timeout: 15000, // 15s window to finish in-flight jobs during rolling deployment or restart
      max_memory_restart: "1G",
      restart_delay: 2000, // 2s backoff between restarts to prevent CPU spin loops on fatal errors
      env_production: {
        NODE_ENV: "production",
        IS_WORKER: "true",
        RUN_CRON_IN_API: "false",
        WORKER_HEALTH_PORT: 8001,
      },
    },
  ],
};
