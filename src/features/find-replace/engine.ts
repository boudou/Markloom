// One search contract for both editors, so a single Find bar drives either.

export interface SearchOptions {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface SearchResult {
  count: number;
  /** 0-based index of the current match, or -1 */
  current: number;
  /** Set when a regex query can't be compiled */
  invalid?: boolean;
}

export interface SearchEngine {
  /** Apply the query (highlight matches) and jump to the first match at or after the cursor */
  update(options: SearchOptions): SearchResult;
  next(): SearchResult;
  previous(): SearchResult;
  replace(): SearchResult;
  replaceAll(): number;
  /** Remove highlights */
  clear(): void;
  focusEditor(): void;
}

/** Builds the RegExp both engines search with; null when the pattern is invalid or empty. */
export function buildSearchRegExp(options: SearchOptions): RegExp | null {
  if (!options.query) return null;
  const escaped = options.regex ? options.query : options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${escaped})(?![\\p{L}\\p{N}_])` : escaped;
  try {
    return new RegExp(source, `gu${options.caseSensitive ? '' : 'i'}`);
  } catch {
    return null;
  }
}
