import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The vault must work with the phone in airplane mode, forever. Everything is
// precached; nothing is fetched at runtime. `connect-src 'none'` is set in the
// deployment headers so the air-gap is visible in devtools — see
// docs/SECURITY.md.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: { globPatterns: ["**/*"] },
      manifest: {
        name: "PixStock Vault",
        short_name: "Vault",
        description: "Offline signer for tokenized stocks. Never connects.",
        display: "standalone",
        background_color: "#1c1a17",
        theme_color: "#1c1a17",
        icons: [],
      },
    }),
  ],
  server: { port: 5173 },
});
