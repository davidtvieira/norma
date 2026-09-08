export interface SumRequestPayload {
  datasetId: string;
  sheetIndex: number;
  column: number;
  startRow: number;
}

export interface SumResponsePayload {
  sum: number;
  rowsSummed: number;
}
