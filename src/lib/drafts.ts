// Keeps a copy of every Untitled tab with unsaved text in IndexedDB, so a crash or a killed
// process doesn't lose it. The session offer brings the copies back on the next launch.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useTabsStore, selectTabContent } from '@/features/tabs';

export interface Draft {
  /** Id of the tab the draft was written for */
  id: string;
  name: string;
  content: string;
  /** Position of the tab in the tab bar, so restored drafts keep their order */
  order: number;
  savedAt: number;
}

interface DraftDb extends DBSchema {
  drafts: { key: string; value: Draft };
}

const DB_NAME = 'markloom-drafts';

const STORE = 'drafts';

const SAVE_DELAY_MS = 1000;

let dbPromise: Promise<IDBPDatabase<DraftDb>> | null = null;

function getDb(): Promise<IDBPDatabase<DraftDb>> {
  dbPromise ??= openDB<DraftDb>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' });
    },
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/** Drafts left by an earlier run (or this one), in tab order; empty when storage is unavailable. */
export async function listDrafts(): Promise<Draft[]> {
  try {
    const drafts = await (await getDb()).getAll(STORE);

    return drafts.sort((a, b) => a.order - b.order);
  } catch (error) {
    console.warn('Could not read drafts', error);

    return [];
  }
}

export async function deleteDrafts(ids: string[]): Promise<void> {
  try {
    const db = await getDb();
    await Promise.all(ids.map((id) => db.delete(STORE, id)));
  } catch (error) {
    console.warn('Could not delete drafts', error);
  }
}

// What this run last wrote per tab id. Only these records are deleted by the tracker:
// drafts from the previous run stay until restoreLastSession has replaced them.
const written = new Map<string, string>();

let timer: number | undefined;

// One write pass at a time, so a slow pass can't land after a newer one
let queue: Promise<void> = Promise.resolve();

let started = false;

async function writeDrafts(): Promise<void> {
  const current = new Map<string, Draft>();

  const state = useTabsStore.getState();

  state.tabs.forEach((tab, order) => {
    if (!tab.path && tab.isDirty) {
      current.set(tab.id, { id: tab.id, name: tab.name, content: selectTabContent(state, tab.id), order, savedAt: Date.now() });
    }
  });

  try {
    const db = await getDb();

    for (const [id, draft] of current) {
      const serialized = JSON.stringify([draft.name, draft.content, draft.order]);

      if (written.get(id) === serialized) continue;

      await db.put(STORE, draft);
      written.set(id, serialized);
    }

    // Saved, closed, or back to unchanged: the draft is no longer needed
    for (const id of written.keys()) {
      if (current.has(id)) continue;

      await db.delete(STORE, id);
      written.delete(id);
    }
  } catch (error) {
    // Drafting is a safety net; never block editing on it
    console.warn('Could not save draft', error);
  }
}

/** Writes the drafts now instead of after the pause. */
export function saveDraftsNow(): Promise<void> {
  window.clearTimeout(timer);
  queue = queue.then(writeDrafts);

  return queue;
}

/** Call once at startup. */
export function startDraftTracking(): void {
  if (started) return;
  started = true;

  useTabsStore.subscribe((state, prev) => {
    // Text lives in `contents`: without it the draft would stop updating after the first keystroke
    if (state.tabs === prev.tabs && state.contents === prev.contents) return;

    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveDraftsNow(), SAVE_DELAY_MS);
  });
}
