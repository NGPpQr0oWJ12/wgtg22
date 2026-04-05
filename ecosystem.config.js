module.exports = {
  apps: [
    {
      name: 'wgtg22',
      script: 'index.js',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 8000, // Увеличил задержку до 8 сек для надежности
      exec_mode: 'fork',   // Явный запуск в режиме fork
      node_args: '--no-network-family-autoselection', // Выключаем "Happy Eyeballs" для стабильного DNS на Node 22+
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
