// Browser-based File System Access API implementation
import { nanoid } from 'nanoid';
import type { FileNode } from '../types';
import { ROOT_KEY, ensurePermission, recallHandle, rememberHandle } from './handleStore';

// Store for directory handles - maps path to handle
let rootDirectoryHandle: FileSystemDirectoryHandle | null = null;
const handleCache = new Map<string, FileSystemDirectoryHandle>();

// Store for individual file handles (for files opened via Open File dialog)
const fileHandleCache = new Map<string, FileSystemFileHandle>();

// Check if File System Access API is supported
export function isFileSystemSupported(): boolean {
  return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
}

// Open folder dialog using File System Access API
export async function openFolderDialog(): Promise<string | null> {
  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });
    rootDirectoryHandle = handle;
    handleCache.clear();
    handleCache.set(handle.name, handle);
    void rememberHandle(ROOT_KEY, handle);
    return handle.name;
  } catch (error) {
    // User cancelled or error
    if ((error as Error).name !== 'AbortError') {
      console.error('Error opening folder:', error);
    }
    return null;
  }
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
    const filePath = await standalonePathFor(fileHandle);

    // Store the handle so we can write back to it later
    fileHandleCache.set(filePath, fileHandle);
    void rememberHandle(filePath, fileHandle);

    return {
      path: filePath,
      content,
    };
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
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

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();

    const filePath = await standalonePathFor(handle);
    fileHandleCache.set(filePath, handle);
    void rememberHandle(filePath, handle);
    return filePath;
  } catch (error) {
    if ((error as Error).name === 'AbortError') return null;
    throw error;
  }
}

// Read directory contents
export async function readDirectory(path: string): Promise<FileNode[]> {
  if (!rootDirectoryHandle) {
    console.log('No root directory handle');
    return [];
  }

  try {
    const nodes: FileNode[] = [];

    // Get the handle for this path
    let handle: FileSystemDirectoryHandle;

    if (path === rootDirectoryHandle.name) {
      handle = rootDirectoryHandle;
    } else {
      // Check cache first
      const cachedHandle = handleCache.get(path);
      if (cachedHandle) {
        handle = cachedHandle;
      } else {
        // Navigate to the directory
        const resolvedHandle = await getDirectoryHandle(path);
        if (!resolvedHandle) {
          console.log('Could not get handle for path:', path);
          return [];
        }
        handle = resolvedHandle;
        handleCache.set(path, handle);
      }
    }

    for await (const entry of handle.values()) {
      // Skip hidden files
      if (entry.name.startsWith('.')) continue;

      const childPath = `${path}/${entry.name}`;

      // Cache directory handles as we find them
      if (entry.kind === 'directory') {
        handleCache.set(childPath, entry as FileSystemDirectoryHandle);
      }

      nodes.push({
        name: entry.name,
        path: childPath,
        isDirectory: entry.kind === 'directory',
        children: entry.kind === 'directory' ? [] : undefined,
      });
    }

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
    return [];
  }
}

// Helper to get nested directory handle by navigating from root
async function getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle | null> {
  if (!rootDirectoryHandle) return null;

  const parts = path.split('/').filter(Boolean);

  // Skip the root name if present
  if (parts[0] === rootDirectoryHandle.name) {
    parts.shift();
  }

  // If no parts left, return root
  if (parts.length === 0) {
    return rootDirectoryHandle;
  }

  let current = rootDirectoryHandle;

  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part);
    } catch (error) {
      console.error(`Failed to get directory handle for "${part}":`, error);
      return null;
    }
  }

  return current;
}

// Helper to get file handle
async function getFileHandle(path: string): Promise<FileSystemFileHandle | null> {
  if (!rootDirectoryHandle) return null;

  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();

  if (!fileName) return null;

  // Skip the root name if present
  if (parts[0] === rootDirectoryHandle.name) {
    parts.shift();
  }

  let current = rootDirectoryHandle;

  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part);
    } catch {
      return null;
    }
  }

  try {
    return await current.getFileHandle(fileName);
  } catch {
    return null;
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
  return `file://${nanoid(8)}/${handle.name}`;
}

/** Display name for any document path (folder path, standalone file, or desktop file) */
export function documentName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

// ---------------------------------------------------------------------------
// Files the OS handed to the desktop app (double-click, "Open with"). Their paths
// look like "desktop:C:/Users/me/notes/plan.md" and go through the Electron bridge.

const DESKTOP_PREFIX = 'desktop:';

export function isDesktopPath(path: string): boolean {
  return path.startsWith(DESKTOP_PREFIX);
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

// A file opened on its own (not via a folder): from this session, or remembered from a past one
async function getStandaloneHandle(path: string): Promise<FileSystemFileHandle | null> {
  const cached = fileHandleCache.get(path);
  if (cached) return cached;
  const remembered = await recallHandle<FileSystemFileHandle>(path);
  if (!remembered || !(await ensurePermission(remembered))) return null;
  fileHandleCache.set(path, remembered);
  return remembered;
}

/**
 * Reopens the folder from the last session. Must run from a user gesture (a click)
 * when the browser needs to ask for permission again. Returns the folder name.
 */
export async function restoreRememberedFolder(): Promise<string | null> {
  const handle = await recallHandle<FileSystemDirectoryHandle>(ROOT_KEY);
  if (!handle || !(await ensurePermission(handle))) return null;
  setRootHandle(handle);
  return handle.name;
}

// Resolve a path inside the open folder to its File object
export async function readFileBlob(path: string): Promise<File> {
  if (isDesktopPath(path)) {
    const bytes = await desktopBridge().readFile(osPathOf(path));
    const name = documentName(path);
    return new File([new Uint8Array(bytes)], name, { type: mimeTypeFor(name) });
  }
  if (path.startsWith('file://')) {
    const handle = await getStandaloneHandle(path);
    if (!handle) throw new Error(`No access to ${documentName(path)}; open it again with Open file`);
    return handle.getFile();
  }

  // First check if we have a cached directory handle for the parent
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();

  if (!fileName) {
    throw new Error(`Invalid path: ${path}`);
  }

  const parentPath = parts.join('/');
  let parentHandle = handleCache.get(parentPath);

  if (!parentHandle && rootDirectoryHandle) {
    if (parentPath === rootDirectoryHandle.name || parentPath === '') {
      parentHandle = rootDirectoryHandle;
    } else {
      const resolvedHandle = await getDirectoryHandle(parentPath);
      if (resolvedHandle) {
        parentHandle = resolvedHandle;
        handleCache.set(parentPath, resolvedHandle);
      }
    }
  }

  if (!parentHandle) {
    throw new Error(`Could not find parent directory for: ${path}`);
  }

  try {
    const fileHandle = await parentHandle.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (error) {
    throw new Error(`File not found: ${path}`);
  }
}

// Read file contents
export async function readFile(path: string): Promise<string> {
  const file = await readFileBlob(path);
  return normalizeLineEndings(await file.text());
}

// Write file contents
export async function writeFile(path: string, content: string | Blob): Promise<void> {
  if (isDesktopPath(path)) {
    const data = typeof content === 'string' ? content : new Uint8Array(await content.arrayBuffer());
    await desktopBridge().writeFile(osPathOf(path), data);
    return;
  }

  let handle: FileSystemFileHandle | null = null;

  // Check if this is a standalone file (opened via Open File dialog)
  if (path.startsWith('file://')) {
    handle = await getStandaloneHandle(path);
  } else {
    // Try to get handle from folder structure
    handle = await getFileHandle(path);
  }

  if (!handle) {
    throw new Error(`File not found: ${path}`);
  }

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

// Create directory
export async function createDirectory(path: string): Promise<void> {
  if (!rootDirectoryHandle) {
    throw new Error('No root directory open');
  }

  const parts = path.split('/').filter(Boolean);
  const dirName = parts.pop();

  if (!dirName) return;

  // Skip the root name
  if (parts[0] === rootDirectoryHandle.name) {
    parts.shift();
  }

  let current = rootDirectoryHandle;

  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }

  const newDir = await current.getDirectoryHandle(dirName, { create: true });
  handleCache.set(path, newDir);
}

// Create file
export async function createFile(path: string, content: string | Blob = ''): Promise<void> {
  if (!rootDirectoryHandle) {
    throw new Error('No root directory open');
  }

  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop();

  if (!fileName) return;

  // Skip the root name
  if (parts[0] === rootDirectoryHandle.name) {
    parts.shift();
  }

  let current = rootDirectoryHandle;

  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }

  const fileHandle = await current.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// Delete file or directory
export async function deleteFileOrDirectory(path: string): Promise<void> {
  if (!rootDirectoryHandle) {
    throw new Error('No root directory open');
  }

  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();

  if (!name) return;

  // Skip the root name
  if (parts[0] === rootDirectoryHandle.name) {
    parts.shift();
  }

  let current = rootDirectoryHandle;

  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }

  await current.removeEntry(name, { recursive: true });
  handleCache.delete(path);
}

// Rename file or directory
export async function renameFileOrDirectory(
  oldPath: string,
  newPath: string
): Promise<void> {
  // File System Access API doesn't have a direct rename method
  // We need to copy and delete
  const content = await readFile(oldPath);
  await createFile(newPath, content);
  await deleteFileOrDirectory(oldPath);
}

// Check if file exists
export async function fileExists(path: string): Promise<boolean> {
  try {
    const handle = await getFileHandle(path);
    return handle !== null;
  } catch {
    return false;
  }
}

// Get root directory handle (for external use)
export function getRootHandle(): FileSystemDirectoryHandle | null {
  return rootDirectoryHandle;
}

// Set root directory handle
export function setRootHandle(handle: FileSystemDirectoryHandle | null): void {
  rootDirectoryHandle = handle;
  handleCache.clear();
  if (handle) {
    handleCache.set(handle.name, handle);
  }
}

// Clear handle cache
export function clearHandleCache(): void {
  handleCache.clear();
}
