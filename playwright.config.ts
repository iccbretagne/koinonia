import { defineConfig, devices } from "@playwright/test";

/**
 * Harnais E2E (docs/e2e.md). Le serveur est lancé en `npm run dev` : la connexion de
 * développement (`/api/auth/dev-login`) est inactive quand NODE_ENV=production, et cette
 * garde ne doit jamais être assouplie.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const common = {
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  colorScheme: "light" as const,
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 60_000,
  use: { baseURL, trace: "retain-on-failure", ...common },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], ...common, viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], ...common },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
