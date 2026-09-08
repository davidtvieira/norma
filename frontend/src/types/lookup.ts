import type { CellValue } from './dataset';

export interface LookupRequestPayload {
  datasetId: string;
  searchSheetIndex: number;
  searchColumn: number;
  resultSheetIndex: number;
  resultColumn: number;
  query: string;
}

export interface LookupResponsePayload {
  found: boolean;
  value: CellValue | null;
  rowIndex: number | null;
}
