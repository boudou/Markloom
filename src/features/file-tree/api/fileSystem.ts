// Browser-based File System Access API implementation
import { nanoid } from 'nanoid';
import type { FileNode } from '../types';
import { ROOT_KEY, ensurePermission, recallDirectoryHandle, recallFileHandle, rememberHandle } from './handleStore';

// The three kinds of document path. Only this file tells them apart (see storeFor):
// - "desktop:C:/Users/me/notes/plan.md": a file the OS handed to the desktop app, read through the Electron bridge
// - "file://<id>/plan.md": a file opened on its own (Open file, Save as, or handed to the installed web app by the OS; see standalonePathFor)
// - "<open folder name>/sub/plan.md": a file inside the open folder
const DESKTOP_PREFIX = 'desktop:';

const STANDALONE_PREFIX = 'file://';

/**
 * The open folder and the handles of folders inside it, keyed by path ("notes/sub"). Opening a folder
 * replaces the whole object, so a walk still running in the previous folder fills a cache nobody reads.
 */
interface OpenFolder {
  readonly handle: FileSystemDirectoryHandle;
  readonly folders: Map<string, FileSystemDirectoryHandle>;
}

let openFolder: OpenFolder | null = null;

// Store for individual file handles (for files opened via Open File dialog)
const fileHandleCache = new Map<string, FileSystemFileHandle>();

// Check if File System Access API is supported
export function isFileSystemSupported(): boolean {
  return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
}

function openRoot(handle: FileSystemDirectoryHandle): void {
  openFolder = { handle, folders: new Map() };
}

// The pickers reject with an AbortError when the user cancels them
function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError';
}

// Open folder dialog using File System Access API
export async function openFolderDialog(): Promise<string | null> {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });

    openRoot(handle);
    void rememberHandle(ROOT_KEY, handle);

    return handle.name;
  } catch (error) {
    if (!isAbortError(error)) {
      console.error('Error opening folder:', error);
    }

    return null;
  }
}

/** Gives a standalone file its path and keeps its handle (here and in IndexedDB), so it can be read and saved later. */
export async function adoptFileHandle(handle: FileSystemFileHandle): Promise<string> {
  const path = await standalonePathFor(handle);
  fileHandleCache.set(path, handle);
  void rememberHandle(path, handle);

  return path;
}

// Open file dialog
export async function openFileDialog(): Promise<{ path: string; content: string } | null> {
  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Markdown Files',
          accept: {
            'text/markdown': ['.md', '.markdown', '.mdx'],
          },
        },
        {
          description: 'Mermaid Diagrams',
          accept: {
            'text/plain': ['.mmd'],
          },
        },
        {
          description: 'Text Files',
          accept: {
            'text/plain': ['.txt', '.text'],
          },
        },
      ],
      excludeAcceptAllOption: false,
      multiple: false,
    });

    const file = await fileHandle.getFile();
    const content = normalizeLineEndings(await file.text());
    const filePath = await adoptFileHandle(fileHandle);

    return {
      path: filePath,
      content,
    };
  } catch (error) {
    if (!isAbortError(error)) {
      console.error('Error opening file:', error);
    }

    return null;
  }
}

// Save-as dialog. Returns the new file's path (writable later via writeFile), or null if cancelled.
export async function saveFileDialog(
  content: string,
  suggestedName: string = 'document.md'
): Promise<string | null> {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'Markdown File',
          accept: { 'text/markdown': ['.md', '.markdown'] },
        },
      ],
    });

    await writeHandle(handle, content);

    return await adoptFileHandle(handle);
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

/**
 * Lists a directory. Subdirectories come back with `children` undefined (not loaded yet).
 * Throws when no folder is open or the directory can't be read, so a failure never looks like an empty folder.
 */
export async function readDirectory(path: string): Promise<FileNode[]> {
  const dirParts = partsBelowRoot(path);

  try {
    const nodes = await inFolder(dirParts, { create: false }, async (dir, folders) => {
      const entries: FileNode[] = [];

      for await (const entry of dir.values()) {
        // Skip hidden files
        if (entry.name.startsWith('.')) continue;

        const childPath = `${path}/${entry.name}`;

        // Cache directory handles as we find them, under the keys inFolder looks up
        if (entry.kind === 'directory') {
          // SAFETY: an entry whose kind is 'directory' is a FileSystemDirectoryHandle
          folders.set(childPath, entry as FileSystemDirectoryHandle);
        }

        entries.push({
          name: entry.name,
          path: childPath,
          isDirectory: entry.kind === 'directory',
        });
      }

      return entries;
    });

    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });

    return nodes;
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
}

/**
 * Identity for a file opened on its own: "file://<id>/<name>". The id keeps two files
 * that share a name (say a/README.md and b/README.md) apart; the same file opened
 * again gets its existing id back.
 */
async function standalonePathFor(handle: FileSystemFileHandle): Promise<string> {
  for (const [path, known] of fileHandleCache) {
    if (await known.isSameEntry(handle)) return path;
  }

  return `${STANDALONE_PREFIX}${nanoid(8)}/${handle.name}`;
}

/** Display name for any document path (folder path, standalone file, or desktop file) */
export function documentName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function desktopPathFor(osPath: string): string {
  return DESKTOP_PREFIX + osPath.replace(/\\/g, '/');
}

function osPathOf(path: string): string {
  return path.slice(DESKTOP_PREFIX.length);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
};

function mimeTypeFor(name: string): string {
  return MIME_BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

function desktopBridge() {
  const bridge = window.markloomDesktop;

  if (!bridge?.readFile) throw new Error('Desktop file access is not available');

  return bridge;
}

// The editor works in LF; Windows files arrive as CRLF and would trip line-based parsing
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

async function writeHandle(handle: FileSystemFileHandle, content: string | Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

// A file opened on its own (not via a folder): from this session, or remembered from a past one
async function standaloneHandle(path: string): Promise<FileSystemFileHandle> {
  const cached = fileHandleCache.get(path);

  if (cached) return cached;

  const remembered = await recallFileHandle(path);

  if (!remembered || !(await ensurePermission(remembered))) {
    throw new Error(`No access to ${documentName(path)}; open it again with Open file`);
  }

  fileHandleCache.set(path, remembered);

  return remembered;
}

/**
 * Reopens the folder from the last session. Must run from a user gesture (a click)
 * when the browser needs to ask for permission again. Returns the folder name.
 */
export async function restoreRememberedFolder(): Promise<string | null> {
  const handle = await recallDirectoryHandle(ROOT_KEY);

  if (!handle || !(await ensurePermission(handle))) return null;
  openRoot(handle);

  return handle.name;
}

// ---------------------------------------------------------------------------
// Walking the open folder

function currentFolder(): OpenFolder {
  if (!openFolder) throw new Error('No folder is open');

  return openFolder;
}

// The segments below the open folder: "notes/sub/b.md" → ["sub", "b.md"]. A path from another folder is refused.
function partsBelowRoot(path: string): string[] {
  const [first, ...rest] = path.split('/').filter(Boolean);

  if (first !== currentFolder().handle.name) throw new Error(`Not in the open folder: ${path}`);

  return rest;
}

function folderPartsOf(path: string): { dirParts: string[]; name: string } {
  const dirParts = partsBelowRoot(path);
  const name = dirParts.pop();

  if (!name) throw new Error(`Invalid path: ${path}`);

  return { dirParts, name };
}

// Drops the cached handles on the way to a folder, so the next walk starts from the open folder again
function forgetFolders({ handle, folders }: OpenFolder, dirParts: string[]): void {
  let key = handle.name;

  for (const part of dirParts) {
    key = `${key}/${part}`;
    folders.delete(key);
  }
}

/**
 * Runs `use` on the folder at `dirParts` below the open folder, creating missing folders when `create` is set.
 * A missing folder on the way (a NotFoundError) becomes "Folder not found"; every other error, such as a revoked
 * permission or a file where a folder should be, passes through unchanged.
 * When something fails, a cached handle on the way may point at a folder deleted or replaced outside
 * Markloom, so they are all dropped; a read that only found no such entry in the folder keeps them.
 */
async function inFolder<T>(
  dirParts: string[],
  { create }: { create: boolean },
  use: (dir: FileSystemDirectoryHandle, folders: OpenFolder['folders']) => Promise<T>
): Promise<T> {
  const root = currentFolder();
  let dir = root.handle;
  let key = root.handle.name;
  let usedCache = false;

  try {
    for (const part of dirParts) {
      key = `${key}/${part}`;
      const cached = root.folders.get(key);

      usedCache ||= !!cached;
      dir = cached ?? (await dir.getDirectoryHandle(part, { create }));
      root.folders.set(key, dir);
    }
  } catch (error) {
    forgetFolders(root, dirParts);

    if (error instanceof DOMException && error.name === 'NotFoundError') throw new Error(`Folder not found: ${key}`);

    throw error;
  }

  try {
    return await use(dir, root.folders);
  } catch (error) {
    const notFound = error instanceof DOMException && error.name === 'NotFoundError';

    if (!create && notFound) throw error;

    forgetFolders(root, dirParts);

    // A write into a cached folder deleted outside Markloom: walk once more from the open folder, which recreates it
    if (create && usedCache && notFound) return inFolder(dirParts, { create }, use);

    throw error;
  }
}

// ---------------------------------------------------------------------------
// One store per kind of path

interface DocumentStore {
  /** False for a file opened on its own: there is no folder to resolve `assets/x.png` or `../b.md` against */
  readonly canResolveRelative: boolean;
  read(path: string): Promise<File>;
  /** Creates the file, and any missing folders on the way, when it doesn't exist */
  write(path: string, content: string | Blob): Promise<void>;
  /**
   * The file's version (see fileVersion) without loading its contents; rejects when the file can't be reached.
   * Left out when `read` already returns a File that loads its bytes only when asked, so its metadata is the version.
   */
  version?(path: string): Promise<string>;
}

const desktopStore: DocumentStore = {
  canResolveRelative: true,

  async read(path) {
    const { bytes, mtimeMs } = await desktopBridge().readFile(osPathOf(path));
    const name = documentName(path);

    return new File([new Uint8Array(bytes)], name, { type: mimeTypeFor(name), lastModified: Math.trunc(mtimeMs) });
  },

  async write(path, content) {
    const data = typeof content === 'string' ? content : new Uint8Array(await content.arrayBuffer());
    await desktopBridge().writeFile(osPathOf(path), data);
  },

  async version(path) {
    const { mtimeMs, size } = await desktopBridge().statFile(osPathOf(path));

    return versionOf(mtimeMs, size);
  },
};

// Handles return a File that reads its bytes only when asked, so its metadata is the version
const standaloneStore: DocumentStore = {
  canResolveRelative: false,

  async read(path) {
    return (await standaloneHandle(path)).getFile();
  },

  async write(path, content) {
    await writeHandle(await standaloneHandle(path), content);
  },
};

const folderStore: DocumentStore = {
  canResolveRelative: true,

  async read(path) {
    const { dirParts, name } = folderPartsOf(path);

    try {
      return await inFolder(dirParts, { create: false }, async (dir) => (await dir.getFileHandle(name)).getFile());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') throw new Error(`File not found: ${path}`);

      throw error;
    }
  },

  async write(path, content) {
    const { dirParts, name } = folderPartsOf(path);

    await inFolder(dirParts, { create: true }, async (dir) =>
      writeHandle(await dir.getFileHandle(name, { create: true }), content)
    );
  },
};

function storeFor(path: string): DocumentStore {
  if (path.startsWith(DESKTOP_PREFIX)) return desktopStore;

  if (path.startsWith(STANDALONE_PREFIX)) return standaloneStore;

  return folderStore;
}

/** Whether relative links and images in the document at `path` can be resolved (false for a file opened on its own) */
export function canResolveRelative(path: string | null): path is string {
  return !!path && storeFor(path).canResolveRelative;
}

export function readFileBlob(path: string): Promise<File> {
  return storeFor(path).read(path);
}

// A file's modified time (whole milliseconds) and size: when either changes, its contents did
function versionOf(modifiedMs: number, size: number): string {
  return `${Math.trunc(modifiedMs)}:${size}`;
}

export function fileVersion(file: File): string {
  return versionOf(file.lastModified, file.size);
}

/** The version of the file at `path`, read without loading its contents. */
export async function readFileVersion(path: string): Promise<string> {
  const store = storeFor(path);

  return store.version ? store.version(path) : fileVersion(await store.read(path));
}

/** The file at `path` when its version is no longer `version`, or null when it is unchanged. Reads it once either way. */
export async function readChangedFile(path: string, version: string): Promise<File | null> {
  const store = storeFor(path);

  if (store.version) return (await store.version(path)) === version ? null : store.read(path);

  const file = await store.read(path);

  return fileVersion(file) === version ? null : file;
}

// Read file contents
export async function readFile(path: string): Promise<string> {
  const file = await readFileBlob(path);

  return normalizeLineEndings(await file.text());
}

/** Writes the file, creating it (and any missing folders) when it doesn't exist */
export function writeFile(path: string, content: string | Blob): Promise<void> {
  return storeFor(path).write(path, content);
}

/** Whether the file can be reached; checks its version, so no contents are loaded */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await readFileVersion(path);

    return true;
  } catch {
    return false;
  }
}
