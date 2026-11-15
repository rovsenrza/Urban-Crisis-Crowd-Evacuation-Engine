import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { tokensToCss } from "./src/design/cssVars";

// Dev server proxies API + WebSocket to the backend, so the browser always
// talks to a single origin (same as the nginx setup in Docker).
const backend = process.env.VITE_BACKEND_URL ?? "http://localhost:8000";

/**
 * Inlines the design tokens as CSS custom properties in index.html, so they
 * exist before any script runs (the launch screen depends on them).
 */
function designTokens(): Plugin {
  return {
    name: "design-tokens",
    transformIndexHtml: (html) => html.replace("/*__TOKENS__*/", tokensToCss()),
  };
}

export default defineConfig({
  plugins: [react(), designTokens()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/docs": { target: backend, changeOrigin: true },
      "/ws": { target: backend, ws: true, changeOrigin: true },
    },
  },
});
