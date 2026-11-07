import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

// Static build (dist/) served by nginx in the container. No runtime network access is needed.
export default defineConfig({
  plugins: [react()],
  build: {target: "es2022", sourcemap: false, chunkSizeWarningLimit: 2000},
});
