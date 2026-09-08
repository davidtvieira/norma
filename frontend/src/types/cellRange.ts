/** A rectangular block of cells within one sheet, all bounds inclusive — like an Excel range. */
export interface CellRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}
