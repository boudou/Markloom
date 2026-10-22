// Service worker of the web version (#174, #213): once controlled, the app still loads when the
// worker can't write its cache, and opens offline after a visit, in both editors.
import type { Page } from '@playwright/test';
import { test as base, expect, type MarkloomApp } from './fixtures';

interface WorkerOptions {
  /** Serve a sw.js whose every cache write rejects, like a full or write-refusing CacheStorage */
  failCacheWrites: boolean;
}

const FAILING_PUT = `Cache.prototype.put = () => Promise.reject(new DOMException('forced by the e2e test', 'QuotaExceededError'));\n`;

/** How many times the current test served the patched sw.js, so it can prove the patch ran (tests in a worker run one at a time) */
const patchedWorker = { loads: 0 };

const test = base.extend<WorkerOptions>({
  failCacheWrites: [false, { option: true }],

  // Routed on the context before the app fixture first opens the page
  context: async ({ context, failCacheWrites }, use) => {
    patchedWorker.loads = 0;

    if (failCacheWrites) {
      await context.route('**/sw.js', async (route) => {
        const response = await route.fetch();

        patchedWorker.loads += 1;
        await route.fulfill({ response, body: FAILING_PUT + (await response.text()) });
      });
    }

    await use(context);
  },
});

// The suite blocks service workers everywhere else
test.use({ serviceWorkers: 'allow' });

/** Waits for the worker to activate, then reloads so it controls the page */
async function reloadUnderWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null), 'the service worker controls the page').toBe(true);
}

async function expectAppShell(page: Page): Promise<void> {
  await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
}

/** Opens fixture.md from the sidebar (after a reload the start screen lists it as a recent file too) */
async function openFixture(app: MarkloomApp): Promise<void> {
  await app.openFolder();
  await app.page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'fixture.md', exact: true }).click();
  await expect(app.rendered()).toContainText(/\S/);
}

// Rich text has to manage without anything only the preview loads (a library, its CSS, a cache)
test.afterEach(async ({ app }) => {
  if (app.editorMode === 'wysiwyg') expect(await app.previewEverMounted(), 'the Markdown preview mounted in rich text').toBe(false);
});

test.describe('when cache writes fail', () => {
  test.use({ failCacheWrites: true });

  test('the page loads and reloads from the network', async ({ app, page }) => {
    await reloadUnderWorker(page);
    await expectAppShell(page);

    await page.reload();
    await expectAppShell(page);
    expect(patchedWorker.loads,'the failing worker was served').toBeGreaterThan(0);

    await openFixture(app);
  });
});

test('opens offline after a visit', async ({ app, context, page }) => {
  await reloadUnderWorker(page);
  // Opening a document online caches the editor's lazy chunks too
  await openFixture(app);

  await context.setOffline(true);
  await page.reload();
  await expectAppShell(page);
  await openFixture(app);
});
