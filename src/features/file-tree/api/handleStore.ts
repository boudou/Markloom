// File System Access handles survive restarts only if we keep them: they are
// structured-cloneable, so IndexedDB can hold them. Access still needs the user's
// permission again in a new session (see ensurePermission).
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'markloom-handles';
const STORE = 'handles';
const MAX_FILE_HANDLES = 50;

export const ROOT_KEY = 'root';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

type StoredHandle = { handle: FileSystemHandle; savedAt: number };

export async function rememberHandle(key: string, handle: FileSystemHandle): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, { handle, savedAt: Date.now() } satisfies StoredHandle, key);

    // Keep the store bounded: drop the oldest standalone-file handles
    const keys = (await db.getAllKeys(STORE)).filter((k) => k !== ROOT_KEY);
    if (keys.length > MAX_FILE_HANDLES) {
      const entries = await Promise.all(keys.map(async (k) => [k, (await db.get(STORE, k)) as StoredHandle] as const));
      entries.sort((a, b) => a[1].savedAt - b[1].savedAt);
      await Promise.all(entries.slice(0, keys.length - MAX_FILE_HANDLES).map(([k]) => db.delete(STORE, k)));
    }
  } catch (error) {
    // Remembering is a convenience; never block opening or saving on it
    console.warn('Could not remember file handle', error);
  }
}

export async function recallHandle<T extends FileSystemHandle>(key: string): Promise<T | null> {
  try {
    const entry = (await (await getDb()).get(STORE, key)) as StoredHandle | undefined;
    return (entry?.handle as T) ?? null;
  } catch {
    return null;
  }
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

  // No permission API: nothing to ask, access is allowed
  if (typeof handle.requestPermission === 'undefined') return true;

  try {
    return (await handle.requestPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}
