module.exports = {
  apps: [
    {
      name: 'lastonline-backend',
      script: 'npm',
      args: 'run start:prod',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
