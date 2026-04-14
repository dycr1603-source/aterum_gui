module.exports = {
  apps: [
    {
      name: 'dashboard',
      script: './trade.js',
      cwd: '/home/admin/aterum_gui',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        BIND_HOST: '0.0.0.0',
        DASHBOARD_PORT: '3001',
        CHART_API_PORT: '3000',
        INTERNAL_DASHBOARD_BASE: 'http://dashboard.internal:3001',
        INTERNAL_N8N_BASE: 'http://n8n.internal:5678'
      }
    },
    {
      name: 'chart-api',
      script: './server.js',
      cwd: '/home/admin/aterum_gui',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        BIND_HOST: '0.0.0.0',
        CHART_API_PORT: '3000'
      }
    }
  ]
};
