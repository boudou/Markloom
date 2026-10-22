import { defineConfig } from '@playwright/test';
import type { EditorOptions } from './e2e/fixtures';

// Several worktrees can run the suite at once, each on its own port (E2E_PORT) with CI=1, so none
// of them reuses another one's server
const port = Number(process.env.E2E_PORT ?? 4173);

const baseURL = `http://localhost:${port}/`;

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
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
