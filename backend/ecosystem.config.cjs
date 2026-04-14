module.exports = {
  apps: [
    {
      name: "cryptox-backend",
      script: "dist/index.js",
      cwd: "/home/ubuntu/cryptox/backend",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "350M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
    },
    {
      name: "cryptox-worker",
      script: "dist/worker.js",
      cwd: "/home/ubuntu/cryptox/backend",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        WORKER_PORT: 4001,
      },
    },
  ],
};
