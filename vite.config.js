import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {readFileSync} from "node:fs";

// Shown in the footer: the version of the build and when it was built (so it is clear which release is running)
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// The build (dist/) is served by server/index.mjs, which also answers /api (the AWS functions).
// In development (npm run dev), /api goes to a server started with: PORT=8080 npm start
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {__APP_VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(new Date().toISOString())},
  build: {target: "es2022", sourcemap: false, chunkSizeWarningLimit: 2000},
  server: {proxy: {"/api": "http://localhost:8080"}},
});
