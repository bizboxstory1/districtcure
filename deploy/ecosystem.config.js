// PM2 Ecosystem — District Cure Production
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name:        'district-cure',
    script:      './server/server.js',
    instances:   'max',          // one per CPU core
    exec_mode:   'cluster',
    watch:        false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'development',
      PORT:     3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT:     3000,
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file:  './logs/err.log',
    out_file:    './logs/out.log',
    merge_logs:  true,
    restart_delay: 1000,
    max_restarts: 10,
  }]
};
