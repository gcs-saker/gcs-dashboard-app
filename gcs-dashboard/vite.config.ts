import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const manualChunkRules: Array<[chunkName: string, packageNames: string[]]> = [
  ["vendor-react", ["react", "react-dom", "react-router-dom"]],
  ["lazy-hls-light", ["hls.js"]],
];

const sourcePath = (relativePath: string): string => {
  const pathname = decodeURIComponent(new URL(relativePath, import.meta.url).pathname);
  return pathname.replace(/^\/([A-Za-z]:\/)/, "$1");
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const devProxyTarget = env.VITE_DEV_PROXY_TARGET || "https://a4ai.tplinkdns.com";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": sourcePath("./src"),
        "@auth": sourcePath("./src/features/auth"),
        "@dashboard": sourcePath("./src/features/dashboard"),
        "@features": sourcePath("./src/features"),
        "@mocks": sourcePath("./src/mocks"),
        "@streaming": sourcePath("./src/features/streaming"),
        "@ui": sourcePath("./src/features/ui")
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
        exclude: ["src/index.tsx", "src/setupTests.ts"],
        thresholds: {
          statements: 88,
          branches: 78,
          functions: 88,
          lines: 90
        }
      }
    }
  };
});
