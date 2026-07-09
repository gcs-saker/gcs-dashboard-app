import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const manualChunkRules: Array<[chunkName: string, packageNames: string[]]> = [
  ["vendor-react", ["react", "react-dom", "react-router-dom"]],
  ["lazy-hls-light", ["hls.js"]],
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || "https://a4ai.tplinkdns.com";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname,
        "@auth": new URL("./src/features/auth", import.meta.url).pathname,
        "@dashboard": new URL("./src/features/dashboard", import.meta.url).pathname,
        "@features": new URL("./src/features", import.meta.url).pathname,
        "@mocks": new URL("./src/mocks", import.meta.url).pathname,
        "@streaming": new URL("./src/features/streaming", import.meta.url).pathname,
        "@ui": new URL("./src/features/ui", import.meta.url).pathname
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            for (const [chunkName, packageNames] of manualChunkRules) {
              if (packageNames.some((packageName) => moduleId.includes(`/node_modules/${packageName}/`))) {
                return chunkName;
              }
            }
            return undefined;
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
        "/auth-policy": {
          target: devProxyTarget,
          changeOrigin: true,
          secure: false
        },
        "/media-control": {
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
      exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
      globals: true,
      setupFiles: "./src/setupTests.ts",
      coverage: {
        provider: "istanbul",
        reporter: ["text", "text-summary"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/index.tsx", "src/setupTests.ts"]
      }
    }
  };
});
