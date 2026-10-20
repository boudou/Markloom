import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'markloom-history';
const DB_VERSION = 1;
const STORE_NAME = 'versions';

export interface VersionEntry {
  id: string;
  filePath: string;
  content: string;
  timestamp: number;
  label?: string;
}

let dbInstance: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by-file', 'filePath');
        store.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

// Generate unique ID for version entry
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Save a new version
export async function saveVersion(
  filePath: string,
  content: string,
  label?: string
): Promise<VersionEntry> {
  const db = await getDb();
  const entry: VersionEntry = {
    id: generateId(),
    filePath,
    content,
    timestamp: Date.now(),
    label,
  };

  await db.put(STORE_NAME, entry);
  return entry;
}

// Get all versions for a file
export async function getVersionsForFile(filePath: string): Promise<VersionEntry[]> {
  const db = await getDb();
  const index = db.transaction(STORE_NAME).store.index('by-file');
  const versions = await index.getAll(filePath);
  // Sort by timestamp descending (newest first)
  return versions.sort((a, b) => b.timestamp - a.timestamp);
}

// Get a specific version
export async function getVersion(id: string): Promise<VersionEntry | undefined> {
  const db = await getDb();
  return db.get(STORE_NAME, id);
}

// Delete a version
export async function deleteVersion(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

// Delete all versions for a file
export async function deleteVersionsForFile(filePath: string): Promise<void> {
  const db = await getDb();
  const index = db.transaction(STORE_NAME, 'readwrite').store.index('by-file');
  const versions = await index.getAll(filePath);

  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const version of versions) {
    await tx.store.delete(version.id);
  }
  await tx.done;
}

// Clean up old versions (keep only the latest N versions per file)
export async function cleanupOldVersions(filePath: string, keepCount: number = 50): Promise<void> {
  const versions = await getVersionsForFile(filePath);

  if (versions.length <= keepCount) return;

  const db = await getDb();
  const toDelete = versions.slice(keepCount);

  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const version of toDelete) {
    await tx.store.delete(version.id);
  }
  await tx.done;
}

// Get total version count for a file
export async function getVersionCount(filePath: string): Promise<number> {
  const versions = await getVersionsForFile(filePath);
  return versions.length;
}

// Update version label
export async function updateVersionLabel(id: string, label: string): Promise<void> {
  const db = await getDb();
  const version = await db.get(STORE_NAME, id);
  if (version) {
    version.label = label;
    await db.put(STORE_NAME, version);
  }
}
