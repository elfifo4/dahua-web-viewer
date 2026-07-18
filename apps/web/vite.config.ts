import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // The backend port lives in the repo-root .env (SERVER_PORT).
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const serverPort = env.SERVER_PORT ?? "8080";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true },
      },
    },
  };
});
