import { useEffect, useState } from 'react';
import { getSavedNrm, listCategories } from '../services/datasetApi';
import type { CategoryNode } from '../types/category';

export interface FolderStep {
  id: string;
  name: string;
}

/** The folders from the top one down to `categoryId`, found in the tree (empty when it is not there). */
export function pathTo(tree: CategoryNode[], categoryId: string): FolderStep[] {
  for (const node of tree) {
    if (node.id === categoryId) return [{ id: node.id, name: node.name }];
    const inside = pathTo(node.children, categoryId);
    if (inside.length > 0) return [{ id: node.id, name: node.name }, ...inside];
  }
  return [];
}

/**
 * The folders a norma kept in the platform is filed under, top-most first — what the Utilizar screen shows as the
 * trail in front of the norma's name. Empty for a norma filed under none; null while it is being read, for a norma that
 * is not in the platform (no `savedId`) and when it could not be read (the toast already said why).
 */
export function useNormaFolderPath(savedId: string | undefined): FolderStep[] | null {
  const [result, setResult] = useState<{ savedId: string; path: FolderStep[] } | null>(null);

  useEffect(() => {
    if (!savedId) return;
    let cancelled = false;
    getSavedNrm(savedId)
      .then(async (saved) => (saved.categoryId ? pathTo(await listCategories(), saved.categoryId) : []))
      .then((path) => {
        if (!cancelled) setResult({ savedId, path });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [savedId]);

  return savedId && result?.savedId === savedId ? result.path : null;
}
