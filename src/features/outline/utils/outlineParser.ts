export type OutlineItemType = 'heading' | 'code' | 'image' | 'link' | 'table';

export interface OutlineItem {
  id: string;
  type: OutlineItemType;
  text: string;
  line: number;
  level?: number; // For headings
  language?: string; // For code blocks
  url?: string; // For images and links
}

// Parse markdown content and extract outline items
export function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = content.split('\n');
  let itemId = 0;
  let inCodeBlock = false;
  let codeBlockStart = 0;
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Track code blocks
    const codeBlockMatch = line.match(/^```(\w*)/);
    if (codeBlockMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStart = lineNumber;
        codeLanguage = codeBlockMatch[1] || 'code';
      } else {
        // End of code block
        items.push({
          id: `outline-${itemId++}`,
          type: 'code',
          text: codeLanguage || 'Code block',
          line: codeBlockStart,
          language: codeLanguage,
        });
        inCodeBlock = false;
        codeLanguage = '';
      }
      continue;
    }

    if (inCodeBlock) continue;

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      items.push({
        id: `outline-${itemId++}`,
        type: 'heading',
        text: headingMatch[2].trim(),
        line: lineNumber,
        level: headingMatch[1].length,
      });
      continue;
    }

    // Images
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let imageMatch;
    while ((imageMatch = imageRegex.exec(line)) !== null) {
      items.push({
        id: `outline-${itemId++}`,
        type: 'image',
        text: imageMatch[1] || 'Image',
        line: lineNumber,
        url: imageMatch[2],
      });
    }

    // Links (but not images)
    const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(line)) !== null) {
      // Only add if it's actually a link, not part of image syntax
      const beforeChar = line[linkMatch.index - 1];
      if (beforeChar !== '!') {
        items.push({
          id: `outline-${itemId++}`,
          type: 'link',
          text: linkMatch[1],
          line: lineNumber,
          url: linkMatch[2],
        });
      }
    }

    // Tables (detect start of table)
    if (line.includes('|') && line.trim().startsWith('|')) {
      // Check if this is the header row (first row of table)
      const prevLine = lines[i - 1]?.trim() || '';
      const nextLine = lines[i + 1]?.trim() || '';

      // If previous line doesn't contain |, this is likely the start of a table
      if (!prevLine.includes('|') && nextLine.includes('|') && nextLine.includes('-')) {
        // Extract header content
        const headerContent = line
          .split('|')
          .filter(cell => cell.trim())
          .map(cell => cell.trim())
          .join(', ');

        items.push({
          id: `outline-${itemId++}`,
          type: 'table',
          text: headerContent || 'Table',
          line: lineNumber,
        });
      }
    }
  }

  return items;
}

// Group items by type
export function groupOutlineItems(items: OutlineItem[]): Record<OutlineItemType, OutlineItem[]> {
  const groups: Record<OutlineItemType, OutlineItem[]> = {
    heading: [],
    code: [],
    image: [],
    link: [],
    table: [],
  };

  for (const item of items) {
    groups[item.type].push(item);
  }

  return groups;
}

// Filter items by type
export function filterOutlineItems(
  items: OutlineItem[],
  types: OutlineItemType[] | null
): OutlineItem[] {
  if (!types || types.length === 0) return items;
  return items.filter(item => types.includes(item.type));
}
