import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSessionCacheEntry, listSessionCacheEntries, saveSessionCacheEntry } from './sessionCache';
import { indexedDB } from 'fake-indexeddb';

beforeEach(() => {
  // fake-indexeddb persists across tests in the same module registry otherwise.
  indexedDB.deleteDatabase('norma-session-cache');
});

describe('sessionCache', () => {
  it('returns no entries when nothing has been cached yet', async () => {
    expect(await listSessionCacheEntries()).toEqual([]);
  });

  it('round-trips a saved entry, including the dataset blob bytes', async () => {
    const blob = new Blob(['fake-xlsx-bytes']);
    await saveSessionCacheEntry('a', { datasetId: null, datasetFileName: 'vendas.xlsx', datasetBlob: blob, modelJson: '{"operations":[]}' });

    const entries = await listSessionCacheEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('a');
    expect(entries[0].datasetFileName).toBe('vendas.xlsx');
    expect(entries[0].modelJson).toBe('{"operations":[]}');
    expect(await entries[0].datasetBlob.text()).toBe('fake-xlsx-bytes');
  });

  it('updates an entry in place when saved again under the same id, instead of duplicating it', async () => {
    await saveSessionCacheEntry('a', { datasetId: null, datasetFileName: 'vendas.xlsx', datasetBlob: new Blob(['x']), modelJson: null });
    await saveSessionCacheEntry('a', { datasetId: null, datasetFileName: 'vendas.xlsx', datasetBlob: new Blob(['x']), modelJson: '{"operations":[]}' });

    const entries = await listSessionCacheEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].modelJson).toBe('{"operations":[]}');
  });

  it('keeps only the 4 most recently saved entries', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      await saveSessionCacheEntry(id, { datasetId: null, datasetFileName: `${id}.xlsx`, datasetBlob: new Blob([id]), modelJson: null });
      await new Promise((resolve) => setTimeout(resolve, 2)); // force distinct savedAt per entry
    }

    const entries = await listSessionCacheEntries();
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.id)).not.toContain('a');
  });

  it('lists entries newest first', async () => {
    await saveSessionCacheEntry('a', { datasetId: null, datasetFileName: 'a.xlsx', datasetBlob: new Blob(['a']), modelJson: null });
    await new Promise((resolve) => setTimeout(resolve, 2)); // force a distinct savedAt
    await saveSessionCacheEntry('b', { datasetId: null, datasetFileName: 'b.xlsx', datasetBlob: new Blob(['b']), modelJson: null });

    const entries = await listSessionCacheEntries();
    expect(entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('deletes one entry without touching the others', async () => {
    await saveSessionCacheEntry('a', { datasetId: null, datasetFileName: 'a.xlsx', datasetBlob: new Blob(['a']), modelJson: null });
    await saveSessionCacheEntry('b', { datasetId: null, datasetFileName: 'b.xlsx', datasetBlob: new Blob(['b']), modelJson: null });
    await deleteSessionCacheEntry('a');

    const entries = await listSessionCacheEntries();
    expect(entries.map((e) => e.id)).toEqual(['b']);
  });
});
