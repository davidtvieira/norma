/** One saved .nrm of the library, as GET /api/v1/library lists it (mirrors the backend's SavedNrmSummary). */
export interface SavedNrmPayload {
  id: string;
  name: string;
  datasetFilename: string;
  sizeBytes: number;
  operationCount: number;
  inputCount: number;
  outputCount: number;
  /** The folder it is filed under, or null for none. */
  categoryId: string | null;
  /** The names from the top-level folder down to it (empty for none). */
  categoryPath: string[];
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** False when the entry is listed but its file is gone from the backend's storage folder. */
  available: boolean;
}

/** A folder as GET /api/v1/library lists it (mirrors the backend's FolderEntry). */
export interface FolderEntryPayload {
  id: string;
  /** Null for a top-level folder. */
  parentId: string | null;
  name: string;
  /** The names from the top-level folder down to this one, itself last. */
  path: string[];
  /** Normas filed directly in it. */
  normaCount: number;
  /** Those too, plus the ones in all the folders inside it. */
  totalCount: number;
  /** How many folders are directly inside it. */
  childCount: number;
}

/** One step of the path being looked into (mirrors the backend's PathStep): a folder and the id to go back to it. */
export interface PathStepPayload {
  id: string;
  name: string;
}

/** What GET /api/v1/library answers (mirrors the backend's LibraryListing): the folders and the normas found. */
export interface LibraryListingPayload {
  /** The folders from the top-level one down to the open one, itself last; empty at the top and when searching everywhere. */
  path: PathStepPayload[];
  categories: FolderEntryPayload[];
  normas: SavedNrmPayload[];
  /** How many normas the library holds in all, whatever was asked for. */
  total: number;
}

/** What the library list can be narrowed and ordered by — GET /api/v1/library's search, sort, direction and level. */
export interface SavedNrmQuery {
  search: string;
  sort: 'name' | 'updatedAt' | 'createdAt' | 'sizeBytes' | 'operationCount';
  direction: 'asc' | 'desc';
  /** The folder being looked into (null = the top level): its folders and the normas filed right in it. */
  folder: string | null;
  /** Look at every folder and norma instead of one level (a search across the whole library). */
  everywhere: boolean;
}

/** The query the library starts with: most recently saved first, nothing searched, the top level. */
export const DEFAULT_SAVED_QUERY: SavedNrmQuery = { search: '', sort: 'updatedAt', direction: 'desc', folder: null, everywhere: false };
