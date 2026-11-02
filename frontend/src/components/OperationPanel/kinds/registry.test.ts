import { describe, expect, it } from 'vitest';
import { KINDS } from './registry';

describe('the kinds that need a dataset', () => {
  // Kept in sync by hand with the backend's OperationTypes (the `requiresDataset` of GET /api/v1/dataset/operations): a
  // norma without a dataset can only hold the other kinds.
  it('are the ones that read sheets, columns or ranges', () => {
    const needing = KINDS.filter((kind) => kind.requiresDataset).map((kind) => kind.id).sort();
    expect(needing).toEqual(['find', 'iterator', 'lookup', 'page', 'sum']);
  });

  it('leave the value-only kinds available without one', () => {
    const free = KINDS.filter((kind) => !kind.requiresDataset).map((kind) => kind.id).sort();
    expect(free).toEqual(['calc', 'counter', 'formatter', 'node', 'selector', 'translator']);
  });
});
