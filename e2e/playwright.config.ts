import { defineConfig, devices } from "@playwright/test";
import { ADMIN_STORAGE_STATE } from "./fixtures/seed";

// По умолчанию — стенд. Локально можно указать другой адрес:
//   E2E_BASE_URL=http://localhost:5177 npm run e2e
const baseURL = process.env.E2E_BASE_URL ?? "https://test.crm.operator.kg";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  // Один повтор: упал → повтор; прошёл со второго раза — репортер
  // помечает как flaky, e2e-notify.py показывает это отдельно от 🔴.
  retries: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./playwright-report", open: "never" }],
    ["json", { outputFile: "./test-results/results.json" }],
  ],
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Asia/Bishkek",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // Логин один раз → storageState; если стенд лежит, падает здесь,
    // и все зависимые проекты скипаются с понятной причиной.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ADMIN_STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
});
