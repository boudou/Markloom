// Web version: nothing loads from Google unless the visitor allows usage statistics (#210), in the
// plain build and in the analytics build the GitHub Pages workflow makes. Every request to Google
// is intercepted, so no test reaches the network. The service worker is covered by offline.spec.ts.
import type { Page, Request } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText } from './fixtures';
import { ANALYTICS_ID, ANALYTICS_PORT, appURL } from './servers';

// What gtag.js reads on the page (the app declares the same in src/vite-env.d.ts)
declare global {
  interface Window {
    dataLayer?: IArguments[];
    [gaDisable: `ga-disable-${string}`]: boolean;
  }
}

const GOOGLE = /^https:\/\/([a-z0-9-]+\.)*(googletagmanager|google-analytics|google)\.com\//;

/** Every request the page makes to Google, answered with an empty script instead */
async function interceptGoogle(page: Page): Promise<Request[]> {
  const requests: Request[] = [];

  await page.route(GOOGLE, (route) => {
    requests.push(route.request());

    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });

  return requests;
}

/** The command palette's options that match `query` (each ends with its group's name) */
async function paletteOptions(page: Page, query: string): Promise<string[]> {
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await page.getByRole('combobox', { name: 'Command' }).fill(query);

  const options = await page.getByRole('listbox', { name: 'Commands' }).getByRole('option').allTextContents();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Commands' })).toBeHidden();

  return options;
}

async function runPaletteCommand(page: Page, label: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await page.getByRole('combobox', { name: 'Command' }).fill(label);
  // The best match is selected first
  await expect(page.getByRole('option', { selected: true })).toContainText(label);
  await page.keyboard.press('Enter');
}

/** gtag.js's command queue as the page built it: each entry is one call's arguments */
function dataLayer(page: Page): Promise<string[][] | null> {
  return page.evaluate(() => window.dataLayer?.map((args) => Array.from(args, (arg) => (arg instanceof Date ? 'date' : String(arg)))) ?? null);
}

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('the plain build loads nothing from Google and offers no usage statistics @web', async ({ app, page }) => {
  const google = await interceptGoogle(page);

  await page.reload();
  await app.openFolder();
  await app.openFile('fixture.md');
  await expect(page.getByRole('region', { name: 'Usage statistics' })).toHaveCount(0);
  expect(await paletteOptions(page, 'Usage statistics')).toEqual([]);
  expect(google.map((request) => request.url())).toEqual([]);
});

test.describe('analytics build', () => {
  test.use({ baseURL: appURL(ANALYTICS_PORT) });

  test('asks first, and loads Google Analytics only after Allow (#210) @web', async ({ app, page }) => {
    const google = await interceptGoogle(page);

    await page.reload();
    await app.openFolder();
    await app.openFile('fixture.md');

    const bar = page.getByRole('region', { name: 'Usage statistics' });

    await expect(bar).toBeVisible({ timeout: 3_000 });
    await expect(bar).toContainText('Count page views with Google Analytics to help improve Markloom? Nothing else is tracked.');
    // Not modal: the document keeps working while the bar waits
    await expect(app.rendered()).toBeVisible();
    expect(google, 'requests to Google before Allow').toHaveLength(0);
    expect(await dataLayer(page)).toBeNull();

    await bar.getByRole('button', { name: 'Allow' }).click();
    await expect.poll(() => google.map((request) => request.url()).join(' ')).toContain(`googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`);
    await expect(bar).toBeHidden();
    // One page view (the config) and nothing of the app's own
    expect(await dataLayer(page)).toEqual([['js', 'date'], ['config', ANALYTICS_ID]]);

    // Editing and saving send nothing more
    await app.placeCursorAfter('Parity fixture');
    await page.keyboard.type(' edited');
    await app.save();
    expect(await dataLayer(page)).toEqual([['js', 'date'], ['config', ANALYTICS_ID]]);
    expect(google, 'one gtag.js request').toHaveLength(1);

    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect.poll(() => google.length).toBe(2);
  });

  test('No thanks is remembered and nothing from Google loads (#210) @web', async ({ app, page }) => {
    const google = await interceptGoogle(page);

    await page.reload();

    const bar = page.getByRole('region', { name: 'Usage statistics' });

    await bar.getByRole('button', { name: 'No thanks' }).click();
    await expect(bar).toBeHidden();
    await page.reload();
    await app.openFolder();
    await app.openFile('fixture.md');
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    await expect(bar).toHaveCount(0);
    expect(await paletteOptions(page, 'Usage statistics')).toEqual([expect.stringMatching(/^Usage statistics: allow/)]);
    expect(google.map((request) => request.url())).toEqual([]);
  });

  test('the palette stops usage statistics and removes the cookies (#210) @web', async ({ app, page, context }) => {
    const google = await interceptGoogle(page);

    await page.reload();
    await page.getByRole('region', { name: 'Usage statistics' }).getByRole('button', { name: 'Allow' }).click();
    await expect.poll(() => google.length).toBe(1);
    await app.openFolder();
    await app.openFile('fixture.md');

    // The stubbed gtag.js sets no cookies: plant the ones the real one would
    const url = appURL(ANALYTICS_PORT);

    await context.addCookies([
      { name: '_ga', value: 'GA1.1.1.1', url },
      { name: '_ga_E2ETEST000', value: 'GS1.1.1', url },
      { name: 'unrelated', value: 'kept', url },
    ]);
    expect(await paletteOptions(page, 'Usage statistics')).toEqual([expect.stringMatching(/^Usage statistics: stop/)]);

    await runPaletteCommand(page, 'Usage statistics: stop');
    await expect(page.getByText('Usage statistics stopped')).toBeVisible();
    expect((await context.cookies(url)).map((cookie) => cookie.name)).toEqual(['unrelated']);
    expect(await page.evaluate((id) => window[`ga-disable-${id}`], ANALYTICS_ID)).toBe(true);

    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Usage statistics' })).toHaveCount(0);
    expect(google, 'no gtag.js after stop').toHaveLength(1);
  });

  test('the bar stays at the bottom edge in focus mode (#210) @web', async ({ app, page }) => {
    await interceptGoogle(page);
    await page.reload();

    const bar = page.getByRole('region', { name: 'Usage statistics' });

    await expect(bar).toBeVisible();
    await app.openFolder();
    await runPaletteCommand(page, 'Focus mode');
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeHidden();
    await expect(bar).toBeVisible();

    const box = await bar.boundingBox();
    const viewport = page.viewportSize();

    expect(box && viewport && Math.round(box.y + box.height)).toBe(viewport?.height);
  });
});
