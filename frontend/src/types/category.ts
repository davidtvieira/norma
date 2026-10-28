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

/** The longest a folder's name can be, in characters — the backend's limit. */
export const MAX_FOLDER_NAME_LENGTH = 50;

/** How many levels deep folders go (a folder, its subfolder, and so on) — the backend's limit. */
export const MAX_FOLDER_DEPTH = 4;
