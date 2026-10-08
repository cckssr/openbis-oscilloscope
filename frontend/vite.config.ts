/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/oscilloscope/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },

  server: {
    // Proxy <base>api/* to the FastAPI backend during development.
    // The frontend requests `${BASE_URL}api/...` (see src/api/client.ts), so the
    // proxy must match under the /oscilloscope/ base. The prefix is stripped
    // before forwarding, so /oscilloscope/api/devices → /devices.
    // In production, Nginx handles this proxy (see deploy/nginx.conf).
    proxy: {
      "/oscilloscope/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/oscilloscope\/api/, ""),
      },
    },
  },

  optimizeDeps: {
    include: ["react-plotly.js", "plotly.js"],
  },

  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
