import type { CellValue } from './dataset';

/** How the search column's cell is compared against the query: "equals" matches the whole
 * (trimmed, case-insensitive) cell text exactly, "contains" matches if the cell text contains the
 * query anywhere in it, "tokenEquals" splits the cell on whichever of tokenIgnoreSpaces/
 * tokenIgnoreDashes are set and matches if the query exactly equals one of the resulting pieces
 * (e.g. a cell of "1 -2" with both set matches a query of "1" or "2", but a cell of "10" never
 * matches a query of "0", unlike "contains"). */
export type LookupMatchMode = 'equals' | 'contains' | 'tokenEquals';

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
  /** Only meaningful for matchMode "tokenEquals" — which characters split the cell into pieces. */
  tokenIgnoreSpaces: boolean;
  tokenIgnoreDashes: boolean;
}

export interface LookupResponsePayload {
  found: boolean;
  value: CellValue | null;
  rowIndex: number | null;
}
