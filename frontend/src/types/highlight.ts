/**
 * One column to tint in full while an operation is being built or edited — so as soon as a
 * search/result table+column is picked in the draft form, it shows up in the sheet viewer.
 * Several of these can be active at once (e.g. more than one operation open for editing).
 */
export interface ColumnHighlight {
  sheetIndex: number;
  column: number;
  role: 'search' | 'result';
  /** Overrides the role's default legend text (see SheetViewer) — e.g. sum's range says "Onde
   * soma" instead of the "search" role's default "Onde procura", since it isn't actually a
   * search. Only changes the label; the role still drives the tint color. */
  label?: string;
}

/**
 * A rectangular block of cells to tint while an operation is being built or edited — the
 * range-based counterpart of ColumnHighlight, used for lookup's search range and sum's range.
 */
export interface RangeHighlight {
  sheetIndex: number;
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  role: 'search' | 'result';
  label?: string;
}

/**
 * The exact input (search) and/or output (result) cell a confirmed operation's query currently
 * matches — shown when hovering that operation's card, not while it's being edited. `rowIndex`
 * is the matched row (same index in both the search and result sheets, when both are given);
 * null while there's no match yet, in which case nothing is highlighted.
 *
 * The search half is optional: lookup (a fixed search column, reading a fixed result column) sets
 * both, but a kind whose match isn't at any single fixed column — e.g. find, which scans a whole
 * range and reports wherever within it the match landed — only has a result cell to point at, its
 * "search" side already covered by that range's own whole-range tint (see RangeHighlight) instead
 * of a second, more precise cell.
 */
export interface OperationHighlight {
  searchSheetIndex?: number;
  searchColumn?: number;
  resultSheetIndex: number;
  resultColumn: number;
  rowIndex: number | null;
  /** Overrides the "result" role's default legend text (see ColumnHighlight's own `label`) —
   * there's no column/range highlight to hang it off for a kind like find, whose result cell only
   * ever comes from this exact-cell highlight, never a tinted column of its own. */
  resultLabel?: string;
}
