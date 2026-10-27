const DB_NAME = 'norma-session-cache';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';
/** The oldest entry past this count is dropped on every save — a .nrm bundles a whole dataset's
 * bytes, so IndexedDB usage is capped rather than growing unbounded across a long-lived browser
 * profile. */
const MAX_ENTRIES = 4;

export interface SessionCacheEntry {
  id: string;
  datasetFileName: string;
  /** The backend id of this session's dataset the last time it was loaded (null for an entry cached
   * before this was tracked) — what lets a page reload on `/d/:datasetId/...` find which cached
   * entry that URL belonged to and restore it (see App.tsx's reload restore). */
  datasetId: string | null;
  /** The dataset's own spreadsheet bytes, unchanged — resuming replays the exact same
   * importDataset call a fresh upload would make, against whichever backend is up when the page
   * next loads (see App.tsx's resumeSession). */
  /** Null for a model opened from the library: it is reopened from there (see savedNrmId), nothing is kept here. */
  datasetBlob: Blob | null;
  /** The model's name, when the entry has no model JSON of its own to read it from. */
  nrmName?: string | null;
  /** The entry's model as exported JSON text (see utils/modelSerialization.ts's ExportedModel) —
   * kept live while editing (App.tsx debounces a save on every modelEntries/modelName/
   * modelInputIds/modelOutputIds change), not just on an explicit "Guardar modelo"/.nrm upload.
   * Null while a dataset is loaded but there's no model yet (or nothing confirmed to export). */
  modelJson: string | null;
  /** The library entry this session's model is kept as (see App.tsx's savedNrmIdRef) — what tells a recent
   * session that is also saved on the platform from one that only lives in this browser. */
  savedNrmId?: string | null;
  savedAt: number;
}

// Writes are applied one after the other, so a mark made right after an entry is created finds it.
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(run);
  writeQueue = result.catch(() => undefined);
  return result;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // v1 kept a single out-of-line-keyed slot under this same store name — drop it rather than
      // try to migrate its one entry into the new keyPath-based shape.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runWrite(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    run(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Newest first — up to MAX_ENTRIES. */
export async function listSessionCacheEntries(): Promise<SessionCacheEntry[]> {
  const db = await openDb();
  const items = await new Promise<SessionCacheEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as SessionCacheEntry[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Creates or updates one entry by `id` — the same id reused across an editing session (see
 * App.tsx's currentSessionIdRef) updates that one entry in place instead of spawning a new one
 * on every debounced autosave, so "last 4" tracks four distinct uploads/sessions, not four
 * snapshots of the same one. Trims down to MAX_ENTRIES afterward, oldest first.
 */
export function saveSessionCacheEntry(id: string, fields: Omit<SessionCacheEntry, 'id' | 'savedAt'>): Promise<void> {
  return enqueue(() => writeSessionCacheEntry(id, fields));
}

async function writeSessionCacheEntry(id: string, fields: Omit<SessionCacheEntry, 'id' | 'savedAt'>): Promise<void> {
  const db = await openDb();
  await runWrite(db, (store) => store.put({ id, ...fields, savedAt: Date.now() }));

  const all = await listSessionCacheEntries();
  const stale = all.slice(MAX_ENTRIES);
  if (stale.length > 0) {
    await runWrite(db, (store) => {
      for (const item of stale) store.delete(item.id);
    });
  }
  db.close();
}

/**
 * Autosave while editing: rewrites only the model half of an entry that already exists. Unlike
 * saveSessionCacheEntry it neither lists every cached entry (each carries a whole dataset's
 * bytes) nor trims — the entry count can't have changed — so a pause in typing or dragging no
 * longer costs a read of every cached spreadsheet.
 */
export function updateSessionCacheModel(id: string, modelJson: string | null): Promise<void> {
  return enqueue(() => patchSessionCacheEntry(id, (existing) => ({ ...existing, modelJson, savedAt: Date.now() })));
}

/** Notes (or, with null, forgets) which library entry a session's model is kept as. */
export function markSessionSaved(id: string, savedNrmId: string | null): Promise<void> {
  return enqueue(() => patchSessionCacheEntry(id, (existing) => ({ ...existing, savedNrmId })));
}

/** A library entry is gone: every session that pointed at it is just a local one again. */
export function forgetSavedNrm(savedNrmId: string): Promise<void> {
  return enqueue(async () => {
    const db = await openDb();
    try {
      const all = await new Promise<SessionCacheEntry[]>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result as SessionCacheEntry[]);
        request.onerror = () => reject(request.error);
      });
      const affected = all.filter((entry) => entry.savedNrmId === savedNrmId);
      if (affected.length === 0) return;
      await runWrite(db, (store) => {
        for (const entry of affected) store.put({ ...entry, savedNrmId: null });
      });
    } finally {
      db.close();
    }
  });
}

async function patchSessionCacheEntry(
  id: string,
  patch: (existing: SessionCacheEntry) => SessionCacheEntry,
): Promise<void> {
  const db = await openDb();
  try {
    const existing = await new Promise<SessionCacheEntry | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result as SessionCacheEntry | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!existing) return;
    await runWrite(db, (store) => store.put(patch(existing)));
  } finally {
    db.close();
  }
}

export async function deleteSessionCacheEntry(id: string): Promise<void> {
  const db = await openDb();
  await runWrite(db, (store) => store.delete(id));
  db.close();
}
