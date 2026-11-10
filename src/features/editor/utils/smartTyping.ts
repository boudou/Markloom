// Typing aids both editors share (#12): which brackets close as you type, and which curly quote a
// typed straight quote becomes. No editor imports, so CodeMirror and Milkdown read the same rules.

/** Brackets that get their closer as you type. Quotes and backticks never do (see #12). */
export const PAIRS = { '(': ')', '[': ']', '{': '}' } as const;

export type Opener = keyof typeof PAIRS;

/** A bracket is only paired when the next character is whitespace, the end, or one of these */
export const PAIR_BEFORE = ')]}:;>';

const OPENS_QUOTE = /(?:^|[\s{[(<'"‘“])$/;

// Inside a link destination or its title: `[a](b "t`
const IN_LINK_DESTINATION = /\]\([^)]*$/;

export function isOpener(text: string): text is Opener {
  return text === '(' || text === '[' || text === '{';
}

/** Whether a bracket may be paired in front of `next` ('' is the end of the line or block) */
export function pairsBefore(next: string): boolean {
  return next === '' || /\s/.test(next) || PAIR_BEFORE.includes(next);
}

// Occurrences of `char` not escaped with a backslash
function unescapedCount(text: string, char: string): number {
  let count = 0;

  for (let at = 0; at < text.length; at++) {
    if (text[at] === '\\') at++;
    else if (text[at] === char) count++;
  }

  return count;
}

/**
 * The curly quote to write for a typed `quote`, or null to keep it straight. `before` is the
 * line's (or textblock's) text before the cursor. An odd number of backticks or `$` means the
 * cursor is in inline code or math that isn't closed yet, which neither parser sees as such.
 */
export function curlyQuote(before: string, quote: '"' | "'"): string | null {
  if (unescapedCount(before, '`') % 2 === 1) return null;

  if (unescapedCount(before, '$') % 2 === 1) return null;

  if (IN_LINK_DESTINATION.test(before)) return null;

  const opens = OPENS_QUOTE.test(before);

  if (quote === '"') return opens ? '“' : '”';

  return opens ? '‘' : '’';
}

/** The straight quote a curly one was typed as, or null for any other character */
export function straightQuote(char: string): '"' | "'" | null {
  if (char === '“' || char === '”') return '"';

  if (char === '‘' || char === '’') return "'";

  return null;
}
