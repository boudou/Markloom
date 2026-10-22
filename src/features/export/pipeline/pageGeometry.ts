// The one place page size and margins are defined. The `@page` rule of exported HTML and the
// page boxes of paged documents (preview, images, PDF) are written from here, and page layouts
// done in the renderer read the content box.

export type PageSize = 'A4' | 'Letter';

export type Orientation = 'portrait' | 'landscape';

export interface PageSetup {
  size: PageSize;
  orientation: Orientation;
}

export interface Box {
  width: number;
  height: number;
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_PAGE_SETUP: PageSetup = { size: 'A4', orientation: 'portrait' };

/** Portrait sizes in millimetres; landscape swaps width and height. */
export const PAGE_SIZES: Record<PageSize, { widthMm: number; heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
};

/** The same margins in both orientations. */
export const PAGE_MARGINS_MM: Margins = { top: 18, right: 16, bottom: 18, left: 16 };

const MM_PER_INCH = 25.4;

const CSS_PX_PER_INCH = 96;

// Inches first: Letter's 215.9 mm is then exactly 816 px (multiplying first gives
// 816.0000000000001, which page images round up to 817)
function mmToPx(mm: number): number {
  return (mm / MM_PER_INCH) * CSS_PX_PER_INCH;
}

function pageMm({ size, orientation }: PageSetup): Box {
  const { widthMm, heightMm } = PAGE_SIZES[size];

  return orientation === 'landscape'
    ? { width: heightMm, height: widthMm }
    : { width: widthMm, height: heightMm };
}

/** The `@page` rule for exported HTML. */
export function pageRule(setup: PageSetup): string {
  const { top, right, bottom, left } = PAGE_MARGINS_MM;

  return `@page { size: ${setup.size} ${setup.orientation}; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }`;
}

/** The whole page in CSS pixels (unrounded). */
export function pageBox(setup: PageSetup): Box {
  const { width, height } = pageMm(setup);

  return { width: mmToPx(width), height: mmToPx(height) };
}

/**
 * The page minus margins in CSS pixels (unrounded). The printed document fills exactly this
 * box because the export styles drop `main.document`'s width cap and padding under
 * `@media print` (`styles.ts`); keep that rule.
 */
export function contentBox(setup: PageSetup): Box {
  const { width, height } = pageMm(setup);
  const { top, right, bottom, left } = PAGE_MARGINS_MM;

  return { width: mmToPx(width - left - right), height: mmToPx(height - top - bottom) };
}
