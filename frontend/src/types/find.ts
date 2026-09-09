export interface FindRequestPayload {
  datasetId: string;
  sheetIndex: number;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  query: string;
}

export interface FindResponsePayload {
  found: boolean;
  rowIndex: number | null;
  columnIndex: number | null;
}
