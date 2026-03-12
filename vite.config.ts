import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const proxyTarget = env.VITE_WIND_API_PROXY_TARGET?.trim() || "https://staging-wind.madewithpris.me";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api/public-wizard": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true
        }
      }
    }
  };
});
