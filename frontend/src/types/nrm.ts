/** Mirrors the backend's NrmImportStatus: the id every later request about the imported .nrm uses.
 * The .nrm already knows its dataset and model, so neither id is returned. */
export interface NrmImportStatusPayload {
  status: string;
  nrmId: string;
}

/** Mirrors the backend's NrmInfo (the .nrm's own info.json). */
export interface NrmInfoPayload {
  version: number;
  name: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}
