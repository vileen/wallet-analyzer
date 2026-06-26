module.exports = {
  apps: [
    {
      name: 'solana-wallet-tracker',
      script: './dist/server.js',
      cwd: '/Users/dominiksoczewka/Projects/solana-wallet-tracker/backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '../logs/err.log',
      out_file: '../logs/out.log',
      merge_logs: true,
    },
  ],
};
