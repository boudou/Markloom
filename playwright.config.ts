import { defineConfig } from '@playwright/test';
import type { EditorOptions } from './e2e/fixtures';
import { ANALYTICS_ID, ANALYTICS_PORT, APP_PORT, appURL, assertPortsFree } from './e2e/servers';

const baseURL = appURL(APP_PORT);

// With CI=1 the suite starts its own servers, so their ports must be free. Checked once, in the
// runner: the workers load this config too, while the servers are up.
if (process.env.CI && !process.env.TEST_WORKER_INDEX) {
  await assertPortsFree([
    { port: APP_PORT, server: 'the app preview', variable: 'E2E_PORT' },
    { port: ANALYTICS_PORT, server: 'the analytics build preview (web.spec.ts)', variable: 'E2E_ANALYTICS_PORT' },
  ]);
}

// E2E_PREBUILT=1 serves the dist/ and dist-analytics/ an earlier run built, for repeated runs
const build = (command: string) => (process.env.E2E_PREBUILT ? '' : `${command} && `);

export default defineConfig<EditorOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry on CI: a test that fails and then passes is reported as flaky, not as a failure
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // The installed Chrome: no browser download needed
    channel: 'chrome',
    // The suite tests the app, not offline support; a service worker would also serve stale builds
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // Every spec runs in both editors. Rich text opens the document straight into rich text, so
  // the Markdown preview never mounts and can't load anything rich text quietly depends on.
  projects: [
    { name: 'markdown', use: { editorMode: 'split' } },
    { name: 'rich-text', use: { editorMode: 'wysiwyg' } },
  ],
  // Builds take minutes when several worktrees build at once, so each server gets ten
  webServer: [
    {
      command: `${build('npm run build')}npx vite preview --port ${APP_PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
    },
    {
      // The web version's analytics exist only in a build with an ID (web.spec.ts)
      command: `${build('npx vite build --outDir dist-analytics --emptyOutDir')}npx vite preview --outDir dist-analytics --port ${ANALYTICS_PORT} --strictPort`,
      env: { VITE_GA_ID: ANALYTICS_ID },
      url: appURL(ANALYTICS_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
    },
  ],
});
