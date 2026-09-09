import type { CellValue } from './dataset';

export interface LookupRequestPayload {
  datasetId: string;
  searchSheetIndex: number;
  searchColumn: number;
  resultSheetIndex: number;
  resultColumn: number;
  query: string;
  /** Skips every row before this one when scanning for a match. 0 searches from the very first
   * row (the only behavior before this field existed). */
  startRow: number;
}

export interface LookupResponsePayload {
  found: boolean;
  value: CellValue | null;
  rowIndex: number | null;
}
