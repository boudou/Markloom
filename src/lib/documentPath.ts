// Pure helpers for document paths with '/' separators: no I/O and no imports, so lazy chunks
// (export, Rich text) can use them without pulling in React hooks or stores.

/** Resolves `target` relative to the folder containing `fromFile` (both use '/' separators). */
export function resolveRelativePath(fromFile: string, target: string): string {
  const parts = fromFile.split('/').filter(Boolean);
  parts.pop(); // drop file name
  const root = parts[0];

  // A leading '/' means "from the root of the open folder"
  const stack = target.startsWith('/') ? (root ? [root] : []) : parts;

  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;

    if (segment === '..') {
      if (stack.length > 1) stack.pop();
    } else {
      stack.push(segment);
    }
  }

  return stack.join('/');
}

/** A link target split at '#', both parts percent-decoded and the query dropped. */
export interface HrefParts {
  path: string;
  hash: string;
}

export function splitHash(href: string): HrefParts {
  const hashIndex = href.indexOf('#');
  const withoutHash = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex + 1);
  const path = withoutHash.split('?')[0];

  return { path: safeDecode(path), hash: safeDecode(hash) };
}

/**
 * The open-folder path of an image or link source as it appears in the rendered document:
 * percent-encoded, possibly with a query or hash. The preview, Rich text and export all use it.
 */
export function resolveSourcePath(fromFile: string, src: string): string {
  return resolveRelativePath(fromFile, splitHash(src).path);
}

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The part of `path` before its last '/', or '' when it has none. */
export function dirname(path: string): string {
  const slash = path.lastIndexOf('/');

  return slash === -1 ? '' : path.slice(0, slash);
}
