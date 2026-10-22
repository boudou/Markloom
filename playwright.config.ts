import { defineConfig } from '@playwright/test';
import type { EditorOptions } from './e2e/fixtures';
import { ANALYTICS_ID, ANALYTICS_PORT, APP_PORT, appURL } from './e2e/servers';

const baseURL = appURL(APP_PORT);

export default defineConfig<EditorOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
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
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${APP_PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      // The web version's analytics exist only in a build with an ID (web.spec.ts)
      command: `npx vite build --outDir dist-analytics --emptyOutDir && npx vite preview --outDir dist-analytics --port ${ANALYTICS_PORT} --strictPort`,
      env: { VITE_GA_ID: ANALYTICS_ID },
      url: appURL(ANALYTICS_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
