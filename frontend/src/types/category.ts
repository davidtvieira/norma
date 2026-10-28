/** A category of the library, with its subcategories — mirrors the backend's CategoryNode (GET /api/v1/categories). */
export interface CategoryNode {
  id: string;
  /** Null for a top-level category. */
  parentId: string | null;
  name: string;
  /** Normas filed directly under it. */
  normaCount: number;
  /** Those too, plus the ones in its subcategories — what choosing it in the list shows. */
  totalCount: number;
  children: CategoryNode[];
}

/** Finds a category anywhere in the tree. */
export function findCategory(tree: CategoryNode[], id: string): CategoryNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const inside = findCategory(node.children, id);
    if (inside) return inside;
  }
  return null;
}

/** How many levels deep folders go (a folder, its subfolder, and so on) — the backend's limit. */
export const MAX_FOLDER_DEPTH = 4;

/** The folders from the top-level one down to `id`, itself last; empty when it is not in the tree. */
export function pathTo(tree: CategoryNode[], id: string | null): CategoryNode[] {
  if (!id) return [];
  for (const node of tree) {
    if (node.id === id) return [node];
    const inside = pathTo(node.children, id);
    if (inside.length > 0) return [node, ...inside];
  }
  return [];
}

/** "Fiscal › IVA › Trimestral": a folder's whole path; '' when there is none or it is not in the tree. */
export function categoryPath(tree: CategoryNode[], id: string | null): string {
  return pathTo(tree, id)
    .map((node) => node.name)
    .join(' › ');
}

/** How many levels a folder's own subtree has, itself included (a folder with no subfolders is 1). */
export function subtreeHeight(node: CategoryNode): number {
  return 1 + Math.max(0, ...node.children.map(subtreeHeight));
}

/** A folder's id and the ids of all its subfolders, at any depth — what "inside this folder" covers. */
export function idsWithin(node: CategoryNode): Set<string> {
  const ids = new Set<string>([node.id]);
  node.children.forEach((child) => idsWithin(child).forEach((id) => ids.add(id)));
  return ids;
}
