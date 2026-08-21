import { defineConfig, devices } from '@playwright/test';

const runtime = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};
const configuredBaseURL = runtime.process?.env?.PLAYWRIGHT_BASE_URL;
const baseURL = configuredBaseURL ?? 'http://127.0.0.1:4399';

export default defineConfig({
  testDir: './tests/e2e',
  ...(configuredBaseURL
    ? {}
    : {
        webServer: {
          command: 'npm run dev -- --host 127.0.0.1 --port 4399',
          url: baseURL,
          reuseExistingServer: false,
          env: { ...runtime.process?.env, ASTRO_DEV_BACKGROUND: '0' },
        },
      }),
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
});
