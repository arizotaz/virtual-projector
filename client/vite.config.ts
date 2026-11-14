import { defineConfig } from "vite";
import { readFileSync } from "node:fs"
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: "../",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
    host: "0.0.0.0",
    https: {
      key: readFileSync(new URL("./certs/lan-key.pem", import.meta.url)),
      cert: readFileSync(new URL("./certs/lan-cert.pem", import.meta.url)),
    },
  },
});
