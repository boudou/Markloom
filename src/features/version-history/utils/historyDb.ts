import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'markloom-history';

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

/** The versions past the newest `keep`; a bad limit (below 1) must never delete a file's whole history */
function pastLimit(newestFirstVersions: VersionMeta[], keep: number): VersionMeta[] {
  return keep < 1 ? [] : newestFirstVersions.slice(keep);
}

/** Stores a snapshot, drops the file's versions past `keep` and returns the kept list, in one transaction. */
export async function saveVersion(filePath: string, content: string, keep: number, label?: string): Promise<VersionMeta[]> {
  const db = await getDb();
  const row: StoredVersion = { id: generateId(), filePath, content, timestamp: Date.now(), label };
  // Only IDB requests may be awaited until `tx.done`, or the transaction commits early
  const tx = db.transaction(['versions', 'meta'], 'readwrite');
  const versions = tx.objectStore('versions');
  const meta = tx.objectStore('meta');
  await versions.put(row);
  await meta.put(toMeta(row));
  const all = (await meta.index('by-file').getAll(filePath)).sort(newestFirst);

  const stale = pastLimit(all, keep);

  for (const version of stale) {
    await versions.delete(version.id);
    await meta.delete(version.id);
  }

  await tx.done;

  return all.slice(0, all.length - stale.length);
}

/** Drops every file's versions past `keep`, in one transaction. */
export async function trimVersions(keep: number): Promise<void> {
  const db = await getDb();
  // Only IDB requests may be awaited until `tx.done`, so the grouping below stays synchronous
  const tx = db.transaction(['versions', 'meta'], 'readwrite');
  const versions = tx.objectStore('versions');
  const meta = tx.objectStore('meta');
  const byFile = new Map<string, VersionMeta[]>();

  for (const version of await meta.getAll()) {
    const group = byFile.get(version.filePath);

    if (group) group.push(version);
    else byFile.set(version.filePath, [version]);
  }

  for (const group of byFile.values()) {
    for (const version of pastLimit(group.sort(newestFirst), keep)) {
      await versions.delete(version.id);
      await meta.delete(version.id);
    }
  }

  await tx.done;
}

/** Deletes every stored version of every file. */
export async function clearAllVersions(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['versions', 'meta'], 'readwrite');
  await tx.objectStore('versions').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
}

export interface HistoryUsage {
  /** Files with at least one version */
  files: number;
  versions: number;
  /** UTF-8 size of every stored snapshot's text */
  bytes: number;
}

/** What version history holds; reads every snapshot's text, so call it only when the numbers are shown. */
export async function readHistoryUsage(): Promise<HistoryUsage> {
  const db = await getDb();
  const tx = db.transaction(['versions', 'meta'], 'readonly');
  const all = await tx.objectStore('meta').getAll();
  const encoder = new TextEncoder();
  let bytes = 0;
  let cursor = await tx.objectStore('versions').openCursor();

  while (cursor) {
    bytes += encoder.encode(cursor.value.content).byteLength;
    cursor = await cursor.continue();
  }

  await tx.done;

  return { files: new Set(all.map((v) => v.filePath)).size, versions: all.length, bytes };
}

export async function deleteVersion(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['versions', 'meta'], 'readwrite');
  await tx.objectStore('versions').delete(id);
  await tx.objectStore('meta').delete(id);
  await tx.done;
}
