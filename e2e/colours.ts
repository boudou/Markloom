// Computed-colour helpers shared by the dark-mode specs (appearance, status colours).
import type { Locator, Page } from '@playwright/test';

export type Appearance = 'system' | 'light' | 'dark';

/** Stores `appearance` in markloom-settings and reloads, so the app starts with it */
export async function startWith(page: Page, appearance: Appearance): Promise<void> {
  await page.addInitScript((value) => {
    if (window !== window.top) return;

    localStorage.setItem('markloom-settings', JSON.stringify({ state: { appearance: value }, version: 1 }));
  }, appearance);
  await page.reload();
}

export async function color(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

export async function background(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

export async function borderColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).borderTopColor);
}

/** The first background painted behind `locator`: its own, or the nearest ancestor's */
export async function paintedBehind(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const value = getComputedStyle(node).backgroundColor;

      if (value !== 'rgba(0, 0, 0, 0)') return value;
    }

    return '';
  });
}

/** WCAG contrast ratio of two opaque `rgb(r, g, b)` colours */
export function contrastRatio(first: string, second: string): number {
  const luminance = (css: string): number => {
    const [r, g, b] = (css.match(/\d+/g) ?? []).map((value) => {
      const c = Number(value) / 255;

      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);

  return (light + 0.05) / (dark + 0.05);
}
