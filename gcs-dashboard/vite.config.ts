import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
    host: "0.0.0.0"
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
});
