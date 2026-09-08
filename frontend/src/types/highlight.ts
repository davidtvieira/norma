/**
 * One column to tint in full while a condition is being built or edited — so as soon as a
 * search/result table+column is picked in the draft form, it shows up in the sheet viewer.
 * Several of these can be active at once (e.g. more than one condition open for editing).
 */
export interface ColumnHighlight {
  sheetIndex: number;
  column: number;
  role: 'search' | 'result';
}

/**
 * The exact input (search) and output (result) cell a confirmed condition's query currently
 * matches — shown when hovering that condition's card, not while it's being edited. `rowIndex`
 * is the matched row (same index in both sheets); null while there's no match yet, in which
 * case nothing is highlighted.
 */
export interface ConditionHighlight {
  searchSheetIndex: number;
  searchColumn: number;
  resultSheetIndex: number;
  resultColumn: number;
  rowIndex: number | null;
}
