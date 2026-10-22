// Quick open's data: the open folder's documents (walked on opening) and their ranking against the query.
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useFileTreeStore } from '@/features/file-tree/stores/fileTreeStore';
import { documentName } from '@/features/file-tree/api/fileSystem';
import { listDocumentFiles, type FolderListing } from '@/features/file-tree/api/folderFiles';
import { errorMessage } from '@/lib/utils';

export type FolderFiles =
  | { status: 'no-folder' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & FolderListing);

// The last finished walk. Keyed by rootId, never rootPath: two folders can share a name.
type WalkOutcome = { rootId: number } & ({ listing: FolderListing } | { message: string });

/**
 * The open folder's documents, walked each time `active` turns on; a walk of a folder no longer open is
 * dropped. The palette stays mounted while closed, so the last listing shows at once on the next opening
 * while a fresh walk runs.
 */
export function useFolderFiles(active: boolean): FolderFiles {
  const rootPath = useAppStore((s) => s.rootPath);
  const rootId = useFileTreeStore((s) => s.rootId);
  const [outcome, setOutcome] = useState<WalkOutcome | null>(null);

  useEffect(() => {
    if (!active || !rootPath) return;

    let current = true;
    const superseded = () => !current || useFileTreeStore.getState().rootId !== rootId;

    // A listing stays on screen during the new walk; an error gives way to "Reading…"
    setOutcome((last) => (last && 'message' in last ? null : last));
    listDocumentFiles(rootPath).then(
      (listing) => {
        if (!superseded()) setOutcome({ rootId, listing });
      },
      (error) => {
        if (!superseded()) setOutcome({ rootId, message: errorMessage(error) });
      }
    );

    return () => {
      current = false;
    };
  }, [active, rootPath, rootId]);

  if (!rootPath) return { status: 'no-folder' };

  if (!outcome || outcome.rootId !== rootId) return { status: 'loading' };

  if ('message' in outcome) return { status: 'error', message: outcome.message };

  return { status: 'ready', ...outcome.listing };
}

export interface RankedFile {
  path: string;
  /** Position in the listing: a stable id for the row (paths may hold characters an HTML id can't) */
  index: number;
}

const WORD_START = new Set(['/', '-', '_', '.', ' ']);

/**
 * Matches the query's characters in order (null when one is missing). Each matched character scores 1,
 * plus 5 when it follows another match, plus 3 at the start of the text or of a word.
 */
function fuzzyScore(query: string, text: string): number | null {
  const lower = text.toLowerCase();
  let score = 0;
  let next = 0;
  let lastMatch = -2;

  for (let i = 0; i < lower.length && next < query.length; i++) {
    if (lower[i] !== query[next]) continue;

    score += 1;

    if (lastMatch === i - 1) score += 5;

    if (i === 0 || WORD_START.has(lower[i - 1])) score += 3;

    lastMatch = i;
    next++;
  }

  return next === query.length ? score : null;
}

/** The path below the open folder ("notes/plan.md"); paths start with the folder's name */
export function relativePath(path: string, rootPath: string): string {
  return path.startsWith(`${rootPath}/`) ? path.slice(rootPath.length + 1) : path;
}

/**
 * Orders the listing for the query. With no query, recent files come first (most recent first), then
 * the rest in listing order. Otherwise a match on the file name beats a match on the path only.
 */
export function rankFiles(paths: string[], query: string, rootPath: string, recentPaths: string[]): RankedFile[] {
  const needle = query.replace(/\s+/g, '').replace(/\\/g, '/').toLowerCase();

  if (!needle) {
    const recentRank = new Map(recentPaths.map((path, i) => [path, i]));
    const files = paths.map((path, index) => ({ path, index, recent: recentRank.get(path) ?? recentPaths.length }));

    // Array.prototype.sort is stable, so the rest keep listing order
    files.sort((a, b) => a.recent - b.recent);

    return files;
  }

  const ranked = paths.flatMap((path, index) => {
    const relative = relativePath(path, rootPath);
    const nameScore = fuzzyScore(needle, documentName(path));
    const rank = nameScore === null ? fuzzyScore(needle, relative) : 1000 + nameScore;

    return rank === null ? [] : [{ path, index, rank, length: relative.length }];
  });

  ranked.sort((a, b) => b.rank - a.rank || a.length - b.length || a.path.localeCompare(b.path));

  return ranked;
}
