// File System Access handles survive restarts only if we keep them: they are
// structured-cloneable, so IndexedDB can hold them. Access still needs the user's
// permission again in a new session (see ensurePermission).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'markloom-handles';

const STORE = 'handles';

const MAX_FILE_HANDLES = 50;

export const ROOT_KEY = 'root';

type StorableHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

type StoredHandle = { handle: StorableHandle; savedAt: number };

interface HandleDb extends DBSchema {
  handles: { key: string; value: StoredHandle };
}

let dbPromise: Promise<IDBPDatabase<HandleDb>> | null = null;

function getDb(): Promise<IDBPDatabase<HandleDb>> {
  dbPromise ??= openDB<HandleDb>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });

  return dbPromise;
}

export async function rememberHandle(key: string, handle: StorableHandle): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, { handle, savedAt: Date.now() } satisfies StoredHandle, key);

    // Keep the store bounded: drop the oldest standalone-file handles
    const keys = (await db.getAllKeys(STORE)).filter((k) => k !== ROOT_KEY);

    if (keys.length > MAX_FILE_HANDLES) {
      const entries = await Promise.all(keys.map(async (k) => [k, (await db.get(STORE, k))?.savedAt ?? 0] as const));
      entries.sort((a, b) => a[1] - b[1]);
      await Promise.all(entries.slice(0, keys.length - MAX_FILE_HANDLES).map(([k]) => db.delete(STORE, k)));
    }
  } catch (error) {
    // Remembering is a convenience; never block opening or saving on it
    console.warn('Could not remember file handle', error);
  }
}

async function recallStored(key: string): Promise<StorableHandle | null> {
  try {
    const entry = await (await getDb()).get(STORE, key);

    return entry?.handle ?? null;
  } catch {
    return null;
  }
}

/** The file handle stored under `key`; null when none is stored or the record holds a directory. */
export async function recallFileHandle(key: string): Promise<FileSystemFileHandle | null> {
  const handle = await recallStored(key);

  return handle?.kind === 'file' ? handle : null;
}

/** The directory handle stored under `key`; null when none is stored or the record holds a file. */
export async function recallDirectoryHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  const handle = await recallStored(key);

  return handle?.kind === 'directory' ? handle : null;
}

/**
 * Whether access to a remembered handle is already granted. Only queries, never asks,
 * so it is safe without a user gesture. False when the browser has no permission API.
 */
export async function hasPermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  if (typeof handle.queryPermission === 'undefined') return false;

  return (await handle.queryPermission({ mode })) === 'granted';
}

/**
 * Checks (and if needed asks for) access to a remembered handle.
 * Asking only works during a user gesture such as a click.
 */
export async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  if (await hasPermission(handle, mode)) return true;

  // No permission API at all: nothing to ask, access is allowed.
  // One that can be queried but not asked has just said no, so there is no access.
  if (typeof handle.requestPermission === 'undefined') return typeof handle.queryPermission === 'undefined';

  try {
    return (await handle.requestPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}
