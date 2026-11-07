import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The build (dist/) is served by server/index.mjs, which also answers /api (the AWS functions).
// In development (npm run dev), /api goes to a server started with: PORT=8080 npm start
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {target: "es2022", sourcemap: false, chunkSizeWarningLimit: 2000},
  server: {proxy: {"/api": "http://localhost:8080"}},
});
