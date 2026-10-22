// Fonts for standalone exports: the app's own faces and KaTeX's, with the woff2 files inlined
// so an exported file looks the same offline.
import { blobToDataUrl } from './assets';

const EXPORT_FONT_FAMILIES = ['Literata', 'Fraunces', 'IBM Plex Mono'];

// Latin and Greek cover the app's audience; other scripts fall back to system fonts
const FONT_SUBSETS = /-(latin|latin-ext|greek|greek-ext)-\d/;

const WOFF2_URL = /url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/;

const DATA_WOFF2_URL = /url\(\s*["']?(data:[^"')]+)["']?\s*\)\s*format\(\s*["']?woff2/;

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;

const SRC = /src\s*:[^;}]*/;

/** A `src:` declaration with the woff2 file at `url` inlined; rejects when it can't be read. */
async function inlinedWoff2(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`Font not found: ${url}`);

  return `src:url(${await blobToDataUrl(await response.blob())}) format('woff2')`;
}

let appFaces: Promise<string> | null = null;

/** The app's own @font-face rules with the font files inlined (fetched once). */
export function embeddedFontFaces(): Promise<string> {
  appFaces ??= (async () => {
    const rules: CSSFontFaceRule[] = [];

    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;

      try {
        cssRules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }

      for (const rule of Array.from(cssRules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const family = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();

        if (EXPORT_FONT_FAMILIES.includes(family)) rules.push(rule);
      }
    }

    const faces = await Promise.all(
      rules.map(async (rule) => {
        const url = rule.style.getPropertyValue('src').match(WOFF2_URL)?.[1];

        if (!url || !FONT_SUBSETS.test(url)) return '';

        try {
          // Rejects on a failed read, so one bad face can't leave the cached promise pending
          const src = await inlinedWoff2(url);
          const s = rule.style;

          return `@font-face{font-family:'${s.getPropertyValue('font-family').replace(/['"]/g, '')}';font-style:${s.getPropertyValue('font-style') || 'normal'};font-weight:${s.getPropertyValue('font-weight') || '400'};font-display:block;${src};unicode-range:${s.getPropertyValue('unicode-range') || 'U+0-10FFFF'};}`;
        } catch {
          return '';
        }
      })
    );

    return faces.join('\n');
  })();

  return appFaces;
}

/** One KaTeX @font-face with only its woff2 source, inlined; dropped when the font can't be read. */
async function inlineKatexFace(rule: string): Promise<string> {
  const data = rule.match(DATA_WOFF2_URL)?.[1];

  if (data) return rule.replace(SRC, `src:url(${data}) format('woff2')`);

  const url = rule.match(WOFF2_URL)?.[1];

  if (!url) return '';

  return rule.replace(SRC, await inlinedWoff2(url));
}

let katexCss: Promise<string> | null = null;

/**
 * KaTeX's stylesheet with its fonts embedded, for exported files that contain math, so they
 * typeset the same offline. Built once; a font that can't be read falls back to the system's.
 */
export function mathExportCss(): Promise<string> {
  katexCss ??= (async () => {
    const { default: css } = await import('katex/dist/katex.min.css?inline');
    const rules = css.match(FONT_FACE) ?? [];
    const faces = await Promise.all(rules.map((rule) => inlineKatexFace(rule).catch(() => '')));
    let index = 0;

    return css.replace(FONT_FACE, () => faces[index++]);
  })();

  return katexCss;
}
