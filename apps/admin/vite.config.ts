import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Set HTTPS=1 (or VITE_HTTPS=1) when you need a secure context on the LAN —
// e.g. for Web NFC on Android Chrome, which only enables NDEFReader on HTTPS
// or http://localhost. The basic-ssl plugin generates a self-signed cert;
// your phone will show a "Not secure" warning the first time — accept it once
// and the kiosk + admin will work for the rest of the session.
const useHttps = process.env.HTTPS === "1" || process.env.VITE_HTTPS === "1";

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: true,        // bind to 0.0.0.0 so the admin is reachable on the LAN
    proxy: {
      "/api":     "http://localhost:4000",
      "/uploads": "http://localhost:4000",
      "/balance": "http://localhost:4000",
    },
  },
});
