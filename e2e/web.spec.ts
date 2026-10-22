// Web version: nothing loads from Google unless the visitor allows usage statistics (#210), in the
// plain build and in the analytics build the GitHub Pages workflow makes. Every request to Google
// is intercepted, so no test reaches the network. The service worker is covered by offline.spec.ts.
import type { Page, Request } from '@playwright/test';
import { test, expect, expectNoPreviewInRichText, knownGap } from './fixtures';
import { ANALYTICS_ID, ANALYTICS_PORT, appURL } from './servers';

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

test.afterEach(async ({ app }) => {
  await expectNoPreviewInRichText(app);
});

test('the plain build loads nothing from Google', async ({ app, page }) => {
  const google = await interceptGoogle(page);

  await page.reload();
  await app.openFolder();
  await app.openFile('fixture.md');
  await expect(page.getByRole('region', { name: 'Usage statistics' })).toHaveCount(0);
  expect(google.map((request) => request.url())).toEqual([]);
});

test.describe('analytics build', () => {
  test.use({ baseURL: appURL(ANALYTICS_PORT) });

  test('asks first, and loads Google Analytics only after Allow (#210)', async ({ app, page }) => {
    knownGap(app, 'both', 210, 'the web version has no usage statistics yet');

    const google = await interceptGoogle(page);

    await page.reload();
    await app.openFolder();
    await app.openFile('fixture.md');

    const bar = page.getByRole('region', { name: 'Usage statistics' });

    await expect(bar).toBeVisible({ timeout: 3_000 });
    expect(google, 'requests to Google before Allow').toHaveLength(0);

    await bar.getByRole('button', { name: 'Allow' }).click();
    await expect.poll(() => google.map((request) => request.url()).join(' ')).toContain(`googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`);
    await expect(bar).toBeHidden();

    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Document actions' })).toBeVisible();
    await expect(bar).toHaveCount(0);
  });
});
