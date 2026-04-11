import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'tests/e2e/.results',
  use: {
    baseURL: 'http://localhost:4321',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Requires a built site — run `npm run build` before `npm run test:e2e`
  // In CI the build step runs before this job.
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
