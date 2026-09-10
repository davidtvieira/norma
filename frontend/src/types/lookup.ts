import type { CellValue } from './dataset';

/** How the search column's cell is compared against the query: "equals" matches the whole
 * (trimmed, case-insensitive) cell text exactly, "contains" matches if the cell text contains the
 * query anywhere in it. */
export type LookupMatchMode = 'equals' | 'contains';

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
  matchMode: LookupMatchMode;
}

export interface LookupResponsePayload {
  found: boolean;
  value: CellValue | null;
  rowIndex: number | null;
}
