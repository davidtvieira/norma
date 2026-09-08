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

export interface DatasetImportResponse {
  datasetId: string;
  filename: string;
  uploadedAt: string;
  sheets: SheetData[];
}
