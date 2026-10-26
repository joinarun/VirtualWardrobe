import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:5173",
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  reporter: [["list"], ["./e2e/required-reporter.ts"]],
});
