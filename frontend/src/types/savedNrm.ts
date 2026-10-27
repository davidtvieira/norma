/** One saved .nrm of the library, as GET /api/v1/library lists it (mirrors the backend's SavedNrmSummary). */
export interface SavedNrmPayload {
  id: string;
  name: string;
  datasetFilename: string;
  sizeBytes: number;
  operationCount: number;
  inputCount: number;
  outputCount: number;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** False when the entry is listed but its file is gone from the backend's storage folder. */
  available: boolean;
}
