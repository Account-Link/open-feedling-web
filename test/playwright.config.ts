import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /(e2e|extension-only)\.spec\.ts$/,
  timeout: 90_000,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  outputDir: "/tmp/pw-out",
});
