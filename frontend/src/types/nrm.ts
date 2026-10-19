import type { DatasetImportResponse } from './dataset';

/** Mirrors the backend's NrmInfo (the .nrm's own info.json). */
export interface NrmInfoPayload {
  version: number;
  name: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** Mirrors the backend's NrmImportResponse. */
export interface NrmImportResponsePayload {
  dataset: DatasetImportResponse;
  info: NrmInfoPayload;
}
