// Cuts a block that runs past the bottom of a page into a part that fits and the rest, at
// the places the print engine breaks: between table rows (the header repeats), between code
// lines, between list items, and between lines of a paragraph. Works on blocks laid out in
// the measuring document (`pages.ts`); the block itself is never changed, the parts are copies.

export interface SplitBlock {
  /** Ends at or above the page bottom it was cut for; marked `data-continues` where styled. */
  head: Element;
  /** The rest, marked `data-continued` where styled. */
  tail: Element;
}

interface Boundary {
  node: Node;
  offset: number;
}

/** Lines a cut paragraph or code block keeps on each side. */
const MIN_LINES = 2;

const BLOCK_CHILD = /^(P|UL|OL|PRE|TABLE|BLOCKQUOTE|FIGURE|DIV|HR|H[1-6])$/;

/** A copy of `element`, with its children when `deep`. */
function copy(element: Element, deep: boolean): Element {
  // SAFETY: cloning an element node always yields an element node
  return element.cloneNode(deep) as Element;
}

/** Where `candidate`'s bottom edge would be if it stood in place of `block`. */
function bottomInPlace(candidate: Element, block: Element): number {
  block.before(candidate);
  const bottom = candidate.getBoundingClientRect().bottom;
  candidate.remove();

  return bottom;
}

/**
 * The split whose head fits above `maxBottom` with the most content, or null when none does.
 * `cuts` are ordered so each one moves more content into the head.
 */
function largestFitting(block: Element, cuts: Array<() => SplitBlock>, maxBottom: number): SplitBlock | null {
  let best: SplitBlock | null = null;
  let low = 0;
  let high = cuts.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const split = cuts[middle]();

    if (bottomInPlace(split.head, block) <= maxBottom) {
      best = split;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best;
}

/** Tables split between body rows; every part after the first repeats the header row. */
function splitTable(table: Element, maxBottom: number): SplitBlock | null {
  const sections = Array.from(table.children);
  const thead = table.querySelector(':scope > thead');
  const tbody = table.querySelector(':scope > tbody');

  // A caption, footer or second body would be lost or misplaced by the copies below
  if (!tbody || sections.some((section) => section !== thead && section !== tbody)) return null;

  const rows = Array.from(tbody.children);

  const part = (from: number, to: number, repeated: boolean) => {
    const result = copy(table, false);

    if (thead) {
      const header = copy(thead, true);

      if (repeated) header.setAttribute('data-repeated', '');
      result.append(header);
    }

    const body = copy(tbody, false);
    body.append(...rows.slice(from, to).map((row) => copy(row, true)));
    result.append(body);

    return result;
  };

  const cuts = rows.slice(1).map((_, index) => () => ({
    head: part(0, index + 1, false),
    tail: part(index + 1, rows.length, true),
  }));

  return largestFitting(table, cuts, maxBottom);
}

/** The text position `offset` characters into `container`. */
function boundaryAt(container: Element, offset: number): Boundary {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;

    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }

  return { node: container, offset: container.childNodes.length };
}

/**
 * Cuts `block` at `at`, a text position inside `container` (the block or its only child, as
 * `code` in `pre`). Range copies re-create the elements the cut passes through on both sides,
 * so a highlighted comment spanning the cut keeps its colour in both parts.
 */
function cutText(block: Element, container: Element, at: Boundary): SplitBlock {
  const range = block.ownerDocument.createRange();
  range.setStart(container, 0);
  range.setEnd(at.node, at.offset);
  const before = range.cloneContents();
  range.setStart(at.node, at.offset);
  range.setEnd(container, container.childNodes.length);
  const after = range.cloneContents();

  const wrap = (contents: DocumentFragment) => {
    const part = copy(block, false);

    if (container === block) {
      part.append(contents);
    } else {
      const inner = copy(container, false);
      inner.append(contents);
      part.append(inner);
    }

    return part;
  };

  const head = wrap(before);
  const tail = wrap(after);
  head.setAttribute('data-continues', '');
  tail.removeAttribute('data-continues');
  tail.setAttribute('data-continued', '');

  return { head, tail };
}

/** Code blocks split after a newline, never inside a wrapped line. */
function splitCode(pre: Element, maxBottom: number): SplitBlock | null {
  const code = pre.querySelector(':scope > code') ?? pre;
  // The fence's own trailing newline doesn't start another line
  const text = (code.textContent ?? '').replace(/\n$/, '');
  const lineEnds: number[] = [];

  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    lineEnds.push(index + 1);
  }

  // Cut after line `MIN_LINES` at the earliest and before the last `MIN_LINES` lines
  const cuts = lineEnds
    .slice(MIN_LINES - 1, Math.max(MIN_LINES - 1, lineEnds.length - MIN_LINES + 1))
    .map((offset) => () => cutText(pre, code, boundaryAt(code, offset)));

  return largestFitting(pre, cuts, maxBottom);
}

/**
 * The start of every line of `paragraph` after the first, found by comparing the positions of
 * its characters; null for a line that starts inside inline code, so the code stays whole.
 */
function lineStarts(paragraph: Element): Array<Boundary | null> {
  const doc = paragraph.ownerDocument;
  const walker = doc.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  const starts: Array<Boundary | null> = [];
  let lineBottom = Number.NEGATIVE_INFINITY;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;

    // Text drawn by inline SVG or MathML isn't laid out in lines
    if (!parent || parent.closest('svg, math')) continue;

    const text = node.textContent ?? '';
    const inCode = parent.closest('code') !== null;

    for (let offset = 0; offset < text.length; offset++) {
      if (/\s/.test(text[offset])) continue;

      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const rect = range.getClientRects()[0];

      if (!rect) continue;

      // Characters on one line overlap vertically; the next line starts below them
      if (rect.top >= lineBottom - 1) {
        if (lineBottom !== Number.NEGATIVE_INFINITY) starts.push(inCode ? null : { node, offset });
        lineBottom = rect.bottom;
      } else {
        lineBottom = Math.max(lineBottom, rect.bottom);
      }
    }
  }

  return starts;
}

/** Paragraphs split between lines, keeping `MIN_LINES` lines on each side. */
function splitParagraph(paragraph: Element, maxBottom: number): SplitBlock | null {
  const starts = lineStarts(paragraph);

  // starts[i] begins line i + 2, so a cut there leaves i + 1 lines above it
  const cuts = starts.flatMap((start, index) => {
    const linesAbove = index + 1;
    const linesBelow = starts.length + 1 - linesAbove;

    if (!start || linesAbove < MIN_LINES || linesBelow < MIN_LINES) return [];

    return [() => cutText(paragraph, paragraph, start)];
  });

  return largestFitting(paragraph, cuts, maxBottom);
}

/** The bottom edge of a run of sibling nodes inside a list item. */
function unitBottom(doc: Document, unit: Node[]): number {
  const range = doc.createRange();
  range.setStartBefore(unit[0]);
  range.setEndAfter(unit[unit.length - 1]);

  return range.getBoundingClientRect().bottom;
}

/**
 * A list item taller than the space left, split inside: before the first child block that
 * doesn't fit, or inside it when that block splits. Inline text is kept whole.
 */
function splitListItem(item: Element, maxBottom: number): SplitBlock | null {
  // Child blocks one by one; runs of inline content (a tight item's text) as one unit
  const units: Node[][] = [];

  for (const node of Array.from(item.childNodes)) {
    const last = units[units.length - 1];
    const isBlock = node.nodeType === Node.ELEMENT_NODE && BLOCK_CHILD.test(node.nodeName);
    const lastIsBlock = last !== undefined && last.length === 1 && BLOCK_CHILD.test(last[0].nodeName);

    if (isBlock || !last || lastIsBlock) units.push([node]);
    else last.push(node);
  }

  const overflow = units.findIndex((unit) => unitBottom(item.ownerDocument, unit) > maxBottom);

  if (overflow === -1) return null;

  const overflowing = units[overflow];
  // Only a child element can be cut further, not a run of inline content
  const child = overflowing.length === 1 ? Array.from(item.children).find((element) => element === overflowing[0]) : undefined;
  const inner = child ? splitBlock(child, maxBottom) : null;

  const before = units.slice(0, overflow).flat();
  const after = units.slice(overflow + 1).flat();
  const hasContentBefore = before.some((node) => node.nodeType === Node.ELEMENT_NODE || /\S/.test(node.textContent ?? ''));

  if (!inner && !hasContentBefore) return null;

  const head = copy(item, false);
  const tail = copy(item, false);
  tail.setAttribute('data-continued', '');
  head.append(...before.map((node) => node.cloneNode(true)));

  if (inner) {
    head.append(inner.head);
    tail.append(inner.tail);
  } else {
    tail.append(...units[overflow].map((node) => node.cloneNode(true)));
  }

  tail.append(...after.map((node) => node.cloneNode(true)));

  return { head, tail };
}

/** Lists split between items; an ordered list's second part continues the numbering. */
function splitList(list: Element, maxBottom: number): SplitBlock | null {
  const items = Array.from(list.children);
  const parsedStart = Number.parseInt(list.getAttribute('start') ?? '1', 10);
  const start = Number.isNaN(parsedStart) ? 1 : parsedStart;

  const part = (parts: Element[], first: number) => {
    const result = copy(list, false);

    if (list.tagName === 'OL') result.setAttribute('start', String(first));
    result.append(...parts);

    return result;
  };

  const cuts = items.slice(1).map((_, index) => () => ({
    head: part(items.slice(0, index + 1).map((item) => copy(item, true)), start),
    tail: part(items.slice(index + 1).map((item) => copy(item, true)), start + index + 1),
  }));

  const between = largestFitting(list, cuts, maxBottom);

  if (between || items.length === 0) return between;

  // Not even the first item fits: cut inside it. Its continuation is unmarked but still
  // counts, so the next item keeps its number.
  const inner = splitListItem(items[0], maxBottom);

  if (!inner) return null;

  const head = part([inner.head], start);
  const tail = part([inner.tail, ...items.slice(1).map((item) => copy(item, true))], start);

  return bottomInPlace(head, list) <= maxBottom ? { head, tail } : null;
}

/** The cut for each kind of block that can be cut, by tag name. */
const SPLITTERS = new Map([
  ['TABLE', splitTable],
  ['PRE', splitCode],
  ['P', splitParagraph],
  ['UL', splitList],
  ['OL', splitList],
]);

/**
 * Cuts `block` (laid out in the measuring document) so the head ends at or above `maxBottom`;
 * null when it can't be cut there, such as an image, a diagram or a quote.
 */
export function splitBlock(block: Element, maxBottom: number): SplitBlock | null {
  const split = SPLITTERS.get(block.tagName);

  return split ? split(block, maxBottom) : null;
}
