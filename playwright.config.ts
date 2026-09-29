import { defineConfig } from "@playwright/test";

// Browser checks of the portal against a production build, with the database
// answered by fixtures inside the test (nothing here touches a real Supabase
// project). Run `bun run build` first, then `bun run test:e2e`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:3110", trace: "retain-on-failure" },
  webServer: {
    command: "node .output/server/index.mjs",
    env: { PORT: "3110" },
    url: "http://localhost:3110/account/login",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
