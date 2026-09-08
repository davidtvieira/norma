export interface SumRequestPayload {
  datasetId: string;
  sheetIndex: number;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

export interface SumResponsePayload {
  sum: number;
  cellsSummed: number;
}
