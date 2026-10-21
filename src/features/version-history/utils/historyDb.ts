import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'markloom-history';

export const MAX_VERSIONS = 50;

export interface VersionMeta {
  id: string;
  filePath: string;
  timestamp: number;
  label?: string;
}

type StoredVersion = VersionMeta & { content: string };

interface HistoryDb extends DBSchema {
  versions: { key: string; value: StoredVersion; indexes: { 'by-file': string; 'by-timestamp': number } };
  meta: { key: string; value: VersionMeta; indexes: { 'by-file': string } };
}

/** A `StoredVersion` passed in loses its `content`. */
function toMeta({ id, filePath, timestamp, label }: VersionMeta): VersionMeta {
  return { id, filePath, timestamp, label };
}

let dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null;

function getDb(): Promise<IDBPDatabase<HistoryDb>> {
  dbPromise ??= openDB<HistoryDb>(DB_NAME, 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const versions = db.createObjectStore('versions', { keyPath: 'id' });
        versions.createIndex('by-file', 'filePath');
        versions.createIndex('by-timestamp', 'timestamp');
      }

      if (oldVersion < 2) {
        // The list reads only this store, so opening the panel never loads snapshot text
        db.createObjectStore('meta', { keyPath: 'id' }).createIndex('by-file', 'filePath');
        let cursor = await tx.objectStore('versions').openCursor();

        while (cursor) {
          await tx.objectStore('meta').put(toMeta(cursor.value));
          cursor = await cursor.continue();
        }
      }
    },
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function newestFirst(a: VersionMeta, b: VersionMeta): number {
  return b.timestamp - a.timestamp;
}

/** The versions of a file, newest first, without their text. */
export async function listVersions(filePath: string): Promise<VersionMeta[]> {
  const db = await getDb();
  const versions = await db.getAllFromIndex('meta', 'by-file', filePath);

  return versions.sort(newestFirst);
}

export async function readVersionContent(id: string): Promise<string | undefined> {
  const db = await getDb();

  return (await db.get('versions', id))?.content;
}

/** Stores a snapshot, drops the file's versions past `MAX_VERSIONS` and returns the kept list, in one transaction. */
export async function saveVersion(filePath: string, content: string, label?: string): Promise<VersionMeta[]> {
  const db = await getDb();
  const row: StoredVersion = { id: generateId(), filePath, content, timestamp: Date.now(), label };
  // Only IDB requests may be awaited until `tx.done`, or the transaction commits early
  const tx = db.transaction(['versions', 'meta'], 'readwrite');
  const versions = tx.objectStore('versions');
  const meta = tx.objectStore('meta');
  await versions.put(row);
  await meta.put(toMeta(row));
  const all = (await meta.index('by-file').getAll(filePath)).sort(newestFirst);

  for (const stale of all.slice(MAX_VERSIONS)) {
    await versions.delete(stale.id);
    await meta.delete(stale.id);
  }

  await tx.done;

  return all.slice(0, MAX_VERSIONS);
}

export async function deleteVersion(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['versions', 'meta'], 'readwrite');
  await tx.objectStore('versions').delete(id);
  await tx.objectStore('meta').delete(id);
  await tx.done;
}
