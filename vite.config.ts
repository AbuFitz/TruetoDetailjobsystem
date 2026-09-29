import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// TrackingMap loads MapLibre's worker from /maplibre/ (see the note there).
// The worker must be the exact same version as the bundled maplibre-gl, or
// the two can't understand each other's messages and the map stays blank.
// Re-copy it from node_modules whenever dev or build starts.
const MAPLIBRE_WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
function syncMaplibreWorker() {
  const from = join(process.cwd(), "node_modules/maplibre-gl/dist");
  const to = join(process.cwd(), "public/maplibre");
  for (const file of MAPLIBRE_WORKER_FILES) {
    const src = join(from, file);
    const dest = join(to, file);
    if (!existsSync(src)) continue;
    if (existsSync(dest) && readFileSync(src).equals(readFileSync(dest))) continue;
    copyFileSync(src, dest);
  }
}

export default defineConfig(async ({ mode, command }) => {
  syncMaplibreWorker();
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const plugins = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro());
  }

  return {
    define,
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    server: {
      host: true,
      port: 8080,
    },
    plugins,
  };
});
