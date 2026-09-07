import type { CellValue, RowData, SheetData } from '../types/dataset';

export function getColumnCount(sheet: SheetData): number {
  return sheet.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
}

export function findCellValue(row: RowData, columnIndex: number): CellValue | undefined {
  return row.cells.find((cell) => cell.columnIndex === columnIndex)?.value;
}

export function formatCellValue(value: CellValue | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
