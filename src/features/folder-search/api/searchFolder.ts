// Searches every document in the open folder, line by line, with the Find bar's matching rules.
import { listDocumentFiles } from '@/features/file-tree/api/folderFiles';
import { readFile } from '@/features/file-tree/api/fileSystem';
import { collectMatches } from '@/features/find-replace/engine';

/** Stop once this many lines have matched */
const MAX_MATCHING_LINES = 1000;

/** Files read at the same time */
const READ_BATCH = 8;

/** A result line shows at most this many characters */
const CLIP_LENGTH = 200;

/**
 * A first match starting after this character starts the clip CLIP_LEAD characters before it. Kept short:
 * the sidebar shows about 35 characters of a row at its default width, and the match must be among them.
 */
const CLIP_AFTER = 24;

const CLIP_LEAD = 16;

export interface MatchRange {
  from: number;
  to: number;
}

export interface LineMatch {
  /** 1-based */
  line: number;
  /** The line, clipped to CLIP_LENGTH characters ("…" first when it starts mid-line) */
  text: string;
  /** Matches within `text` */
  ranges: MatchRange[];
}

export interface FileMatches {
  path: string;
  lines: LineMatch[];
}

export interface FolderSearchResult {
  files: FileMatches[];
  lineCount: number;
  /** Stopped at MAX_MATCHING_LINES with more matches possible (in the last file or in files not read) */
  lineLimitReached: boolean;
  /** The folder holds more files than the walk lists */
  listingTruncated: boolean;
  /** Files that couldn't be read, skipped */
  unreadable: number;
}

/** Fits a long line around its first match, shifting the match ranges to the clipped text */
function clipLine(line: number, lineText: string, matches: MatchRange[]): LineMatch {
  const firstFrom = matches[0]?.from ?? 0;
  const start = firstFrom > CLIP_AFTER ? firstFrom - CLIP_LEAD : 0;
  const prefix = start > 0 ? '…' : '';
  const end = Math.min(lineText.length, start + CLIP_LENGTH);
  const shift = prefix.length - start;

  const ranges = matches.flatMap((match) =>
    match.from >= end ? [] : [{ from: match.from + shift, to: Math.min(match.to, end) + shift }]
  );

  return { line, text: prefix + lineText.slice(start, end), ranges };
}

/** The matching lines of one document; `regex` is a `g` regex from buildSearchRegExp */
function searchText(text: string, regex: RegExp): LineMatch[] {
  const found: LineMatch[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const matches = collectMatches(regex, lines[i], 0);

    if (matches.length) found.push(clipLine(i + 1, lines[i], matches));
  }

  return found;
}

type FileOutcome = { lines: LineMatch[] } | { unreadable: true };

/**
 * Searches the Markdown and Mermaid files under `rootPath`. A document open in a tab is searched with
 * its text in `openDocuments` (path → text, unsaved edits included), so line numbers match the editor.
 * Files come back in listing order (sorted paths). Rejects only when the folder itself can't be listed;
 * returns what it has so far once `signal` aborts (the caller drops it).
 */
export async function searchFolder(
  rootPath: string,
  regex: RegExp,
  openDocuments: ReadonlyMap<string, string>,
  signal: AbortSignal
): Promise<FolderSearchResult> {
  const listing = await listDocumentFiles(rootPath);

  const result: FolderSearchResult = {
    files: [],
    lineCount: 0,
    lineLimitReached: false,
    listingTruncated: listing.truncated,
    unreadable: 0,
  };

  const searchFile = async (path: string): Promise<FileOutcome> => {
    try {
      const text = openDocuments.get(path) ?? (await readFile(path));

      return { lines: searchText(text, regex) };
    } catch {
      return { unreadable: true };
    }
  };

  for (let start = 0; start < listing.paths.length; start += READ_BATCH) {
    if (signal.aborted) return result;

    const batch = listing.paths.slice(start, start + READ_BATCH);
    const outcomes = await Promise.all(batch.map(searchFile));

    for (let i = 0; i < batch.length; i++) {
      const outcome = outcomes[i];

      if ('unreadable' in outcome) {
        result.unreadable += 1;
        continue;
      }

      if (!outcome.lines.length) continue;

      const room = MAX_MATCHING_LINES - result.lineCount;
      const lines = outcome.lines.length > room ? outcome.lines.slice(0, room) : outcome.lines;
      result.files.push({ path: batch[i], lines });
      result.lineCount += lines.length;

      if (result.lineCount === MAX_MATCHING_LINES) {
        // More matches may follow, in this file or the next: say so rather than read on
        result.lineLimitReached = outcome.lines.length > room || start + i + 1 < listing.paths.length;

        return result;
      }
    }
  }

  return result;
}
