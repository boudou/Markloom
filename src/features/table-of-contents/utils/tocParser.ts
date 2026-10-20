export interface TocItem {
  id: string;
  text: string;
  level: number;
  line: number;
}

/**
 * Parse markdown content and extract headings for TOC
 */
export function parseTableOfContents(content: string): TocItem[] {
  const lines = content.split('\n');
  const items: TocItem[] = [];
  let inCodeBlock = false;

  lines.forEach((line, index) => {
    // Track code blocks to ignore headings inside them
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) return;

    // Match ATX-style headings (# Heading)
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = generateSlug(text);

      items.push({
        id,
        text,
        level,
        line: index + 1, // 1-based line number
      });
    }
  });

  return items;
}

/**
 * Generate a URL-friendly slug from heading text
 */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .trim();
}

/**
 * Find the current heading based on scroll position/line
 */
export function findCurrentHeading(
  items: TocItem[],
  currentLine: number
): TocItem | null {
  // Find the last heading before or at the current line
  let current: TocItem | null = null;

  for (const item of items) {
    if (item.line <= currentLine) {
      current = item;
    } else {
      break;
    }
  }

  return current;
}

/**
 * Get the minimum heading level in the TOC
 */
export function getMinLevel(items: TocItem[]): number {
  if (items.length === 0) return 1;
  return Math.min(...items.map((item) => item.level));
}
