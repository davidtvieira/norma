import type { CategoryNode } from '../types/category';
import type { FolderEntryPayload, SavedNrmPayload } from '../types/savedNrm';

/** A folder of the tree, with what is inside it: its subfolders first, then the normas filed right in it. */
export interface TreeFolder {
  kind: 'folder';
  id: string;
  parentId: string | null;
  name: string;
  /** 0 for a top-level folder. */
  depth: number;
  /** The names from the top-level folder down to this one, itself last. */
  path: string[];
  /** Normas filed right in it. */
  normaCount: number;
  /** Those too, plus the ones in every folder inside it. */
  totalCount: number;
  children: TreeItem[];
}

export interface TreeNorma {
  kind: 'norma';
  model: SavedNrmPayload;
  depth: number;
}

export type TreeItem = TreeFolder | TreeNorma;

/**
 * The library as a tree: the folders (as the backend's category tree gives them) with the normas filed in each, and the
 * normas filed under none at the top level, after the folders. A norma whose folder is unknown (deleted meanwhile) is
 * treated as filed under none. The normas keep the order they were given in (the backend orders them). With `pruneEmpty`
 * (while searching) a folder that holds none of the given normas, at any depth, is left out, so the tree shows only the
 * way to what was found.
 */
export function buildNormaTree(categories: CategoryNode[], normas: SavedNrmPayload[], { pruneEmpty = false } = {}): TreeItem[] {
  const known = new Set<string>();
  const collect = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      known.add(node.id);
      collect(node.children);
    }
  };
  collect(categories);

  const byFolder = new Map<string | null, SavedNrmPayload[]>();
  for (const model of normas) {
    const key = model.categoryId !== null && known.has(model.categoryId) ? model.categoryId : null;
    byFolder.set(key, [...(byFolder.get(key) ?? []), model]);
  }

  const build = (nodes: CategoryNode[], depth: number, parentPath: string[]): TreeFolder[] => {
    const folders: TreeFolder[] = [];
    for (const node of nodes) {
      const path = [...parentPath, node.name];
      const direct = byFolder.get(node.id) ?? [];
      const subfolders = build(node.children, depth + 1, path);
      const children: TreeItem[] = [...subfolders, ...direct.map((model): TreeNorma => ({ kind: 'norma', model, depth: depth + 1 }))];
      const totalCount = direct.length + subfolders.reduce((sum, folder) => sum + folder.totalCount, 0);
      if (pruneEmpty && totalCount === 0) continue;
      folders.push({
        kind: 'folder',
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        depth,
        path,
        // Not what the library says (that counts the whole library): what the tree shows here.
        normaCount: direct.length,
        totalCount: pruneEmpty ? totalCount : node.totalCount,
        children,
      });
    }
    return folders;
  };

  const rootNormas = (byFolder.get(null) ?? []).map((model): TreeNorma => ({ kind: 'norma', model, depth: 0 }));
  return [...build(categories, 0, []), ...rootNormas];
}

/** The id of every folder in the tree. */
export function folderIds(items: TreeItem[]): string[] {
  return items.flatMap((item) => (item.kind === 'folder' ? [item.id, ...folderIds(item.children)] : []));
}

/** A folder as the folder dialogs know it (rename, move, delete). */
export function toFolderEntry(folder: TreeFolder): FolderEntryPayload {
  return {
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
    path: folder.path,
    normaCount: folder.normaCount,
    totalCount: folder.totalCount,
    childCount: folder.children.filter((child) => child.kind === 'folder').length,
  };
}

/**
 * The rows the tree shows, top to bottom: each folder, then — unless it is collapsed — what is inside it. `collapsed` holds
 * the folders closed by the user; `openAll` (while searching) ignores it so every match is visible.
 */
export function visibleRows(items: TreeItem[], collapsed: ReadonlySet<string>, openAll = false): TreeItem[] {
  return items.flatMap((item) =>
    item.kind === 'folder' ? [item, ...(openAll || !collapsed.has(item.id) ? visibleRows(item.children, collapsed, openAll) : [])] : [item],
  );
}
