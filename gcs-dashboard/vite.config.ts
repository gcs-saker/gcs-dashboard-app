import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || "https://a4ai.tplinkdns.com";

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-map": ["leaflet", "react-leaflet"],
            "lazy-3d": ["three", "@react-three/fiber"],
            "lazy-media": ["hls.js"],
            "vendor-charts": ["recharts"]
          }
        }
      }
    },
    server: {
      host: "0.0.0.0",
      port: Number(env.PORT || 5173),
      proxy: {
        "/api": {
          target: devProxyTarget,
          changeOrigin: true,
          secure: false
        },
        "/hls": {
          target: devProxyTarget,
          changeOrigin: true,
          secure: false
        },
        "/webrtc": {
          target: devProxyTarget,
          changeOrigin: true,
          secure: false
        }
      }
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.js",
      coverage: {
        provider: "istanbul",
        reporter: ["text", "text-summary"],
        include: ["src/**/*.{jsx,ts,tsx}"],
        exclude: ["src/index.tsx", "src/reportWebVitals.js", "src/setupTests.js"]
      }
    }
  };
});
