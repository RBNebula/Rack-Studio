import { defineConfig } from '@playwright/test';
// Preserve the existing Edge workflow on Windows; use bundled Chromium on Linux/CI.
const channel =
  process.env.RACK_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium');
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  maxFailures: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1600, height: 1000 },
    headless: true,
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    launchOptions: {
      ...(channel === 'chromium' ? {} : { channel }),
      args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
});
