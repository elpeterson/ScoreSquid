import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, APP_URL, assertLocal, MSO_PORT, MSO_STAND_IN, supabaseEnv } from './e2e/support/env';

const supabase = supabaseEnv();
assertLocal(supabase);
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
    { name: 'iphone', use: { ...devices['iPhone 15 Pro'] }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: 'node e2e/stubs/mso.mjs',
      url: `${MSO_STAND_IN}/__requests`,
      env: { E2E_MSO_PORT: String(MSO_PORT) },
      reuseExistingServer: !ci,
    },
    {
      // CI tests a production build; locally the dev server is quicker to start.
      command: ci ? `npm run build && npm run start -- -p ${APP_PORT}` : `npx next dev --turbopack -p ${APP_PORT}`,
      url: `${APP_URL}/`,
      timeout: 300_000,
      reuseExistingServer: !ci,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabase.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
        NEXT_PUBLIC_BASE_URL: APP_URL,
        NEXT_PUBLIC_AUTH_COOKIE_DOMAIN: '',
        NEXT_TELEMETRY_DISABLED: '1',
        E2E_MSO_ORIGIN: MSO_STAND_IN,
        // Nothing in these journeys reads Between Ends; this keeps any stray call local.
        E2E_BE_ORIGIN: MSO_STAND_IN,
      },
    },
  ],
});
