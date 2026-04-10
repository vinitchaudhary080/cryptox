module.exports = {
  apps: [
    {
      name: "cryptox-backend",
      script: "dist/index.js",
      cwd: "/home/ubuntu/cryptox/backend",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    }
  ]
};