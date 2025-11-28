module.exports = {
  apps: [{
    name: 'bicrypto-v5',
    script: 'pnpm',
    args: 'start',
    cwd: '/home/criptonexi/public_html',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
