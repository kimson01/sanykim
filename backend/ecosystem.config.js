// ecosystem.config.js — PM2 cluster configuration for Sany Adventures
//
// USAGE:
//   npm install -g pm2
//   pm2 start ecosystem.config.js --env production
//   pm2 save        ← persist across server reboots
//   pm2 startup     ← auto-start on boot
//   pm2 monit       ← live dashboard
//   pm2 logs        ← tail all logs
//
// SCALING:
//   pm2 scale sany-adventures-api 4   ← change to 4 workers live (zero downtime)
//   pm2 reload sany-adventures-api    ← rolling restart (zero downtime)

module.exports = {
  apps: [
    {
      name:          'sany-adventures-api',
      script:        'server.js',

      // ── Cluster mode ─────────────────────────────────────
      // 'max' = one worker per CPU core.
      // A 2-core server runs 2 workers; a 4-core runs 4.
      // Each worker handles ~800 concurrent users independently.
      instances:     process.env.PM2_INSTANCES || 'max',
      exec_mode:     'cluster',

      // ── Memory / restart policy ───────────────────────────
      // Restart a worker if it exceeds 512MB (memory leak protection)
      max_memory_restart: '512M',
      // Restart if the process crashes (exponential backoff)
      exp_backoff_restart_delay: 100,
      max_restarts:  10,
      min_uptime:    '10s',

      // ── Zero-downtime deploys ────────────────────────────
      // PM2 sends SIGINT, waits for in-flight requests to finish,
      // then kills the process. Set to your longest expected request time.
      kill_timeout:  5000,
      wait_ready:    true,
      listen_timeout: 8000,

      // ── Logging ───────────────────────────────────────────
      out_file:   './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,  // all workers → single log file

      // ── Environment overrides ────────────────────────────
      env: {
        NODE_ENV:  'development',
        PORT:      5000,
      },
      env_production: {
        NODE_ENV:          'production',
        PORT:              5000,
        // Reduce pool per worker — total = DB_POOL_MAX × instances
        // On a 4-core server: 5 × 4 = 20 connections (Neon free tier limit)
        DB_POOL_MAX:       5,
        DB_POOL_MIN:       1,
        DB_STATEMENT_TIMEOUT: 15000,
      },
    },
  ],
};
