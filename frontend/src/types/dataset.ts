/**
 * TypeScript mirror of the backend dataset JSON contract.
 * Rows and cells are addressed purely by index; no header row is assumed.
 */

export type CellValue = string | number | boolean | null;

export interface CellData {
  columnIndex: number;
  value: CellValue;
}

export interface RowData {
  rowIndex: number;
  cells: CellData[];
}

export interface SheetData {
  sheetName: string;
  totalRows: number;
  rows: RowData[];
}

/** What the import endpoints return: only that it went through and the id every later request
 * uses. Mirrors the backend's DatasetImportStatus. */
export interface DatasetImportStatus {
  status: string;
  datasetId: string;
}

/** The imported dataset as App tracks it everywhere except the editor: its id plus the uploaded
 * file's name (known client-side), with no sheet data — that is fetched on demand (see
 * hooks/useDatasetSheets.ts) by the one screen that shows it. */
export interface DatasetHandle {
  /** Identifies the session in the URL (/d/:datasetId) and the cache: the dataset's id — or, when
   * `nrmId` is set, that same .nrm id, since an imported .nrm's dataset id is never handed out
   * (the backend's /nrm endpoints resolve it). Only pass it to dataset endpoints when `nrmId` is
   * unset. */
  datasetId: string;
  filename: string;
  /** Set when the dataset came from importing a .nrm: that .nrm's own id, used instead of the
   * dataset's wherever the backend offers an endpoint for it (sheets, and the model's inputs/run). */
  nrmId?: string;
  /** Set when the model was opened from the platform: the library entry's own id, which is what its address uses
   * (`/normas/:savedId`) because — unlike the ids above — it survives a reload and a backend restart. */
  savedId?: string;
}

export interface DatasetImportResponse {
  datasetId: string;
  filename: string;
  uploadedAt: string;
  sheets: SheetData[];
}
