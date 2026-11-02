import { describe, expect, it } from 'vitest';
import { buildNormaTree, folderIds, toFolderEntry, visibleRows, type TreeFolder } from './normaTree';
import type { CategoryNode } from '../types/category';
import type { SavedNrmPayload } from '../types/savedNrm';

const folder = (id: string, name: string, children: CategoryNode[] = []): CategoryNode => ({
  id, parentId: null, name, normaCount: 0, totalCount: 9, children,
});
const norma = (id: string, categoryId: string | null): SavedNrmPayload => ({
  id, name: `norma ${id}`, datasetFilename: null, description: null, sizeBytes: 1, operationCount: 1, inputCount: 1, outputCount: 1,
  categoryId, categoryPath: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', available: true,
});

const categories = [folder('a', 'Pasta A', [folder('a1', 'Sub A1')]), folder('b', 'Pasta B')];
const normas = [norma('n1', 'a1'), norma('n2', null), norma('n3', 'a'), norma('n4', 'gone')];

describe('buildNormaTree', () => {
  it('puts each norma in its folder, subfolders before normas, and the unfiled ones last at the top', () => {
    const tree = buildNormaTree(categories, normas);

    expect(tree.map((item) => (item.kind === 'folder' ? item.name : item.model.id))).toEqual(['Pasta A', 'Pasta B', 'n2', 'n4']);
    const a = tree[0] as TreeFolder;
    expect(a.children.map((child) => (child.kind === 'folder' ? child.name : child.model.id))).toEqual(['Sub A1', 'n3']);
    const a1 = a.children[0] as TreeFolder;
    expect(a1.children.map((child) => (child.kind === 'norma' ? child.model.id : '?'))).toEqual(['n1']);
  });

  it('knows each folder\'s depth and path, and treats a norma of an unknown folder as unfiled', () => {
    const a1 = (buildNormaTree(categories, normas)[0] as TreeFolder).children[0] as TreeFolder;
    expect([a1.depth, a1.path]).toEqual([1, ['Pasta A', 'Sub A1']]);
    expect(buildNormaTree(categories, normas).filter((item) => item.kind === 'norma').map((item) => item.depth)).toEqual([0, 0]);
  });

  it('while searching, leaves out the folders that hold none of the normas found and counts what is shown', () => {
    const tree = buildNormaTree(categories, [norma('n1', 'a1')], { pruneEmpty: true });
    expect(tree.map((item) => (item.kind === 'folder' ? item.name : '?'))).toEqual(['Pasta A']);
    const a = tree[0] as TreeFolder;
    expect([a.totalCount, a.normaCount]).toEqual([1, 0]);
    expect(buildNormaTree(categories, [], { pruneEmpty: true })).toEqual([]);
  });
});

describe('folderIds / toFolderEntry / visibleRows', () => {
  const tree = buildNormaTree(categories, normas);

  it('lists every folder at any depth', () => {
    expect(folderIds(tree)).toEqual(['a', 'a1', 'b']);
  });

  it('describes a folder the way the folder dialogs expect', () => {
    expect(toFolderEntry(tree[0] as TreeFolder)).toMatchObject({ id: 'a', name: 'Pasta A', path: ['Pasta A'], normaCount: 1, childCount: 1 });
  });

  it('hides what is inside a collapsed folder, unless every folder is to be open', () => {
    const names = (rows: ReturnType<typeof visibleRows>) => rows.map((row) => (row.kind === 'folder' ? row.name : row.model.id));
    expect(names(visibleRows(tree, new Set()))).toEqual(['Pasta A', 'Sub A1', 'n1', 'n3', 'Pasta B', 'n2', 'n4']);
    expect(names(visibleRows(tree, new Set(['a'])))).toEqual(['Pasta A', 'Pasta B', 'n2', 'n4']);
    expect(names(visibleRows(tree, new Set(['a']), true))).toHaveLength(7);
  });
});
