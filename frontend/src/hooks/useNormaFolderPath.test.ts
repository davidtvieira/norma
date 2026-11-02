import { describe, expect, it } from 'vitest';
import { pathTo } from './useNormaFolderPath';
import type { CategoryNode } from '../types/category';

const node = (id: string, children: CategoryNode[] = []): CategoryNode => ({ id, parentId: null, name: `pasta ${id}`, normaCount: 0, totalCount: 0, children });

describe('pathTo', () => {
  const tree = [node('a', [node('b', [node('c')]), node('d')]), node('e')];

  it('lists the folders from the top one down to the one asked for', () => {
    expect(pathTo(tree, 'c').map((step) => step.id)).toEqual(['a', 'b', 'c']);
    expect(pathTo(tree, 'e').map((step) => step.id)).toEqual(['e']);
    expect(pathTo(tree, 'd')[1]).toEqual({ id: 'd', name: 'pasta d' });
  });

  it('is empty for a folder that is not in the tree', () => {
    expect(pathTo(tree, 'zzz')).toEqual([]);
  });
});
