// Every document in the open folder, for Quick open. The sidebar tree reads a folder only when it is
// expanded, so this walks the whole folder on its own.
import { isMarkdownFile, isMermaidFile } from '@/lib/utils';
import type { FileNode } from '../types';
import { readDirectory } from './fileSystem';

export const MAX_FILES = 5000;

const MAX_DEPTH = 32;

// Dot-folders (.git) are already skipped by readDirectory
const SKIPPED_FOLDERS = new Set(['node_modules']);

export interface FolderListing {
  paths: string[];
  /** The walk stopped at MAX_FILES */
  truncated: boolean;
}

/**
 * Lists the Markdown and Mermaid files under the open folder, breadth first, reading every folder of
 * one depth in parallel. Rejects when the open folder itself can't be read; a subfolder that can't be
 * read is skipped. Paths come back sorted.
 */
export async function listDocumentFiles(rootPath: string): Promise<FolderListing> {
  const paths: string[] = [];
  let truncated = false;
  // The contents of every folder read at the current depth
  let level: FileNode[][] = [await readDirectory(rootPath)];

  for (let depth = 1; level.length && !truncated; depth++) {
    const subfolders: string[] = [];

    for (const node of level.flat()) {
      if (node.isDirectory) {
        if (!SKIPPED_FOLDERS.has(node.name)) subfolders.push(node.path);
      } else if (isMarkdownFile(node.name) || isMermaidFile(node.name)) {
        if (paths.length === MAX_FILES) {
          truncated = true;
          break;
        }

        paths.push(node.path);
      }
    }

    if (truncated || depth === MAX_DEPTH) break;

    const reads = await Promise.allSettled(subfolders.map(readDirectory));
    level = reads.flatMap((read) => (read.status === 'fulfilled' ? [read.value] : []));
  }

  paths.sort((a, b) => a.localeCompare(b));

  return { paths, truncated };
}
