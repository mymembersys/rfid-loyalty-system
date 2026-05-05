import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS=1 enables a self-signed cert via @vitejs/plugin-basic-ssl —
// needed for Web NFC writing on Android Chrome over the LAN.
const useHttps = process.env.HTTPS === "1" || process.env.VITE_HTTPS === "1";

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api":     "http://localhost:4000",
      "/uploads": "http://localhost:4000",
      "/balance": "http://localhost:4000",
    },
  },
});
