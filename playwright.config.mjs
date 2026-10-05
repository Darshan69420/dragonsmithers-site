import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:8080', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npx http-server . -p 8080 -c-1 -s',
    url: 'http://localhost:8080/',
    reuseExistingServer: !process.env.CI,
  },
});
