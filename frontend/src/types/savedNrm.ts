/** One saved .nrm of the library, as GET /api/v1/library lists it (mirrors the backend's SavedNrmSummary). */
export interface SavedNrmPayload {
  id: string;
  name: string;
  datasetFilename: string;
  sizeBytes: number;
  operationCount: number;
  inputCount: number;
  outputCount: number;
  /** The category it is filed under, or null for none. */
  categoryId: string | null;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** False when the entry is listed but its file is gone from the backend's storage folder. */
  available: boolean;
}

/** What the library list can be narrowed and ordered by — GET /api/v1/library's search, sort and direction. */
export interface SavedNrmQuery {
  search: string;
  sort: 'name' | 'updatedAt' | 'createdAt' | 'sizeBytes' | 'operationCount';
  direction: 'asc' | 'desc';
}

/** The query the library starts with: most recently saved first, nothing searched. */
export const DEFAULT_SAVED_QUERY: SavedNrmQuery = { search: '', sort: 'updatedAt', direction: 'desc' };
