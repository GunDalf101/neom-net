import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // main.tsx calls registerSW()
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "NEOM//NET",
        short_name: "NEOM//NET",
        description: "Cyberpunk tabletop RPG campaign operating system: PLAYER//HUD and DM//CONTROL.",
        theme_color: "#04060a",
        background_color: "#04060a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        categories: ["games", "entertainment"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [{ name: "Campaigns", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
      },
      workbox: {
        // Push + notification click handlers live in public/push-sw.js and are pulled into the generated worker.
        importScripts: ["push-sw.js"],
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: { cacheName: "neom-fonts", expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      // Dev worker so push can be subscribed against `npm run dev`; navigation is not intercepted in dev.
      devOptions: { enabled: true, navigateFallback: undefined, suppressWarnings: true },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: false },
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
