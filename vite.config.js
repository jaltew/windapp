import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(function (_a) {
    var _b;
    var mode = _a.mode;
    var env = loadEnv(mode, ".", "");
    var proxyTarget = ((_b = env.VITE_WIND_API_PROXY_TARGET) === null || _b === void 0 ? void 0 : _b.trim()) || "https://staging-wind.madewithpris.me";
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
