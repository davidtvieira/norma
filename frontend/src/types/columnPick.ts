import type { CellRange } from './cellRange';

/** Which of lookup's two column fields is being picked from the sheet viewer. */
export type ColumnPickField = 'search' | 'result';

/** Picking a single column from the sheet viewer by clicking its header. */
export interface ColumnPickState {
  entryId: string;
  field: ColumnPickField;
  sheetIndex: number;
  column: number | null;
}

/**
 * Picking a rectangular range of cells from the sheet viewer by dragging over them, Excel-style
 * (currently just sum's range). `range` stays null until the drag is released, at which point
 * the field consuming it commits the value and clears the pick state.
 */
export interface RangePickState {
  entryId: string;
  sheetIndex: number;
  range: CellRange | null;
}
