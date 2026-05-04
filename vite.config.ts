import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: "src/renderers/react",
  resolve: {
    alias: {
      "@game": path.resolve(__dirname, "src/game"),
    },
  },
  build: {
    outDir: "../../../dist",
  },
  server: {
    port: 3000,
  },
  optimizeDeps: {
    include: ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei"],
  },
});
