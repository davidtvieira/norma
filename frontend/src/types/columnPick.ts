export type ColumnPickField = 'search' | 'result';

export interface ColumnPickState {
  entryId: string;
  field: ColumnPickField;
  sheetIndex: number;
  column: number | null;
}
