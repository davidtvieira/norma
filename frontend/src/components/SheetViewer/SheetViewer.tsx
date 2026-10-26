import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CellRange } from '../../types/cellRange';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../../types/highlight';
import { findCellValue, formatCellValue, getColumnCount } from '../../utils/sheet';
import './SheetViewer.css';

interface ColumnPicker {
  selectedColumn: number | null;
}

interface CellPosition {
  row: number;
  column: number;
}

function normalizeRange(anchor: CellPosition, focus: CellPosition): CellRange {
  return {
    startRow: Math.min(anchor.row, focus.row),
    endRow: Math.max(anchor.row, focus.row),
    startColumn: Math.min(anchor.column, focus.column),
    endColumn: Math.max(anchor.column, focus.column),
  };
}

function isWithinRange(row: number, column: number, range: CellRange): boolean {
  return row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn;
}

export interface MatchedCell {
  sheetIndex: number;
  row: number;
  column: number;
  role: 'search' | 'result';
}

interface SheetViewerProps {
  dataset: DatasetImportResponse;
  activeSheetIndex: number;
  onActiveSheetIndexChange: (index: number) => void;
  tabsDisabled?: boolean;
  columnPicker?: ColumnPicker | null;
  onColumnHeaderClick?: (columnIndex: number) => void;
  /** When true, dragging over the cell grid selects a rectangular range (see onRangeSelected). */
  rangePicker?: boolean;
  onRangeSelected?: (range: CellRange) => void;
  columnHighlights?: ColumnHighlight[];
  rangeHighlights?: RangeHighlight[];
  cellHighlight?: OperationHighlight | null;
  /** Individual cells to mark (e.g. everything a model run read), independent of cellHighlight. */
  matchedCells?: MatchedCell[];
  /** Whether the viewer is on screen (its panel is open). Each time it becomes so, the viewer jumps to
   * the sheet the highlights are on and scrolls the first needed column (and its row) into view. */
  active?: boolean;
}

/**
 * Renders a parsed sheet as an index-addressed row/cell grid. When `columnPicker` is set,
 * column headers become clickable so a lookup operation can pick a column directly from
 * the table instead of a dropdown; when `rangePicker` is set, dragging over the cell grid
 * selects a rectangular block of cells instead, Excel-style — either way tabs lock to the
 * sheet being picked from. `columnHighlights`/`rangeHighlights` tint whole columns or
 * rectangular ranges for operations being built or edited. `cellHighlight` marks the exact
 * input/output cell of a confirmed operation's current match, shown while hovering its card.
 * Only whatever belongs to the currently displayed sheet lights up.
 */
export function SheetViewer({
  dataset,
  activeSheetIndex,
  onActiveSheetIndexChange,
  tabsDisabled = false,
  columnPicker = null,
  onColumnHeaderClick,
  rangePicker = false,
  onRangeSelected,
  columnHighlights = [],
  rangeHighlights = [],
  cellHighlight = null,
  matchedCells = [],
  active = false,
}: SheetViewerProps) {
  const activeSheet = dataset.sheets[activeSheetIndex];
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [dragAnchor, setDragAnchor] = useState<CellPosition | null>(null);
  const [dragFocus, setDragFocus] = useState<CellPosition | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  // Where to scroll to once the sheet it is on is the one displayed.
  const [focusTarget, setFocusTarget] = useState<{ sheetIndex: number; column: number; row: number | null } | null>(null);
  const hasFocusedRef = useRef(false);

  // Once per opening: the first thing highlighted decides which sheet to show and what to bring into view
  // (the highlights may arrive a moment after the panel opens, so this waits for the first one).
  useEffect(() => {
    if (!active) {
      hasFocusedRef.current = false;
      return;
    }
    if (hasFocusedRef.current) return;
    const column = columnHighlights[0];
    const range = rangeHighlights[0];
    const cell = matchedCells[0];
    const target = column
      ? { sheetIndex: column.sheetIndex, column: column.column, row: null }
      : range
        ? { sheetIndex: range.sheetIndex, column: range.startColumn, row: range.startRow }
        : cell
          ? { sheetIndex: cell.sheetIndex, column: cell.column, row: cell.row }
          : cellHighlight
            ? {
                sheetIndex: cellHighlight.searchSheetIndex ?? cellHighlight.resultSheetIndex,
                column: cellHighlight.searchColumn ?? cellHighlight.resultColumn,
                row: cellHighlight.rowIndex,
              }
            : null;
    if (!target) return;
    hasFocusedRef.current = true;
    setFocusTarget(target);
    if (target.sheetIndex !== activeSheetIndex) onActiveSheetIndexChange(target.sheetIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, columnHighlights, rangeHighlights, matchedCells, cellHighlight]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!focusTarget || focusTarget.sheetIndex !== activeSheetIndex || !wrapper) return;
    const header = wrapper.querySelector(`th[data-column="${focusTarget.column}"]`);
    const row = focusTarget.row !== null ? wrapper.querySelector(`tr[data-row="${focusTarget.row}"]`) : null;
    // Offsets are measured against the scroll box itself, so the panel sliding in doesn't matter. The
    // column goes right after the row numbers, at the left of the view — the browser stops short of
    // that on its own when the column is too close to the end of the sheet to get there.
    const box = wrapper.getBoundingClientRect();
    const rowNumbersWidth = wrapper.querySelector('th.sheet-viewer__row-index-header')?.getBoundingClientRect().width ?? 0;
    const left = header ? wrapper.scrollLeft + header.getBoundingClientRect().left - box.left - rowNumbersWidth : wrapper.scrollLeft;
    const top = row ? wrapper.scrollTop + row.getBoundingClientRect().top - box.top - box.height / 3 : wrapper.scrollTop;
    wrapper.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'smooth' });
    setFocusTarget(null);
  }, [focusTarget, activeSheetIndex]);

  const columnCount = useMemo(() => getColumnCount(activeSheet), [activeSheet]);

  const columnIndexes = Array.from({ length: columnCount }, (_, index) => index);

  // Rows aren't guaranteed to be a contiguous 0..N-1 range (no header row is assumed), so a
  // "whole column" picked from the header spans the sheet's actual first/last row indexes.
  const rowIndexes = activeSheet.rows.map((row) => row.rowIndex);
  const minRowIndex = rowIndexes.length > 0 ? Math.min(...rowIndexes) : 0;
  const maxRowIndex = rowIndexes.length > 0 ? Math.max(...rowIndexes) : 0;

  const dragPreviewRange = dragAnchor && dragFocus ? normalizeRange(dragAnchor, dragFocus) : null;

  // Ends the drag wherever the mouse is released, even outside the table — a per-cell mouseup
  // handler would miss that case and leave the selection stuck open. Registered synchronously
  // (useLayoutEffect, not useEffect) so a very fast click's mouseup can't race ahead of it.
  useLayoutEffect(() => {
    if (!dragAnchor) return;

    function finishDrag() {
      if (dragPreviewRange) {
        onRangeSelected?.(dragPreviewRange);
      }
      setDragAnchor(null);
      setDragFocus(null);
    }

    window.addEventListener('mouseup', finishDrag);
    return () => window.removeEventListener('mouseup', finishDrag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragAnchor, dragFocus]);

  const columnHighlightRoles = useMemo(() => {
    const roles = new Map<number, 'search' | 'result'>();
    for (const highlight of columnHighlights) {
      if (highlight.sheetIndex === activeSheetIndex && !roles.has(highlight.column)) {
        roles.set(highlight.column, highlight.role);
      }
    }
    return roles;
  }, [columnHighlights, activeSheetIndex]);

  const activeRangeHighlights = useMemo(
    () => rangeHighlights.filter((highlight) => highlight.sheetIndex === activeSheetIndex),
    [rangeHighlights, activeSheetIndex],
  );

  function rangeHighlightRoleAt(row: number, column: number): 'search' | 'result' | null {
    for (const highlight of activeRangeHighlights) {
      if (isWithinRange(row, column, highlight)) {
        return highlight.role;
      }
    }
    return null;
  }

  const activeMatchedCells = useMemo(
    () => matchedCells.filter((cell) => cell.sheetIndex === activeSheetIndex),
    [matchedCells, activeSheetIndex],
  );

  const cellHighlightSearchColumn =
    cellHighlight && cellHighlight.searchSheetIndex === activeSheetIndex ? cellHighlight.searchColumn : null;
  const cellHighlightResultColumn =
    cellHighlight && cellHighlight.resultSheetIndex === activeSheetIndex ? cellHighlight.resultColumn : null;
  const cellHighlightRowIndex = cellHighlight?.rowIndex ?? null;

  // Drives the legend below — only shown for roles actually tinted on the currently displayed
  // sheet (e.g. sum never has a "result" highlight, its output isn't a single column/cell), with
  // whichever highlight's own label (see ColumnHighlight/RangeHighlight) — e.g. sum's "Onde
  // soma" instead of the "search" role's default "Onde procura" — taking priority over that
  // default when one is set.
  const activeColumnHighlights = columnHighlights.filter((highlight) => highlight.sheetIndex === activeSheetIndex);
  const searchLabel =
    activeColumnHighlights.find((highlight) => highlight.role === 'search' && highlight.label)?.label ??
    activeRangeHighlights.find((highlight) => highlight.role === 'search' && highlight.label)?.label ??
    'Onde procura';
  const activeCellHighlightResultLabel =
    cellHighlight && cellHighlight.resultSheetIndex === activeSheetIndex ? cellHighlight.resultLabel : undefined;
  const resultLabel =
    activeColumnHighlights.find((highlight) => highlight.role === 'result' && highlight.label)?.label ??
    activeRangeHighlights.find((highlight) => highlight.role === 'result' && highlight.label)?.label ??
    activeCellHighlightResultLabel ??
    'O que devolve';
  const hasSearchHighlight =
    cellHighlightSearchColumn !== null ||
    activeMatchedCells.some((cell) => cell.role === 'search') ||
    activeColumnHighlights.some((highlight) => highlight.role === 'search') ||
    activeRangeHighlights.some((highlight) => highlight.role === 'search');
  const hasResultHighlight =
    cellHighlightResultColumn !== null ||
    activeMatchedCells.some((cell) => cell.role === 'result') ||
    activeColumnHighlights.some((highlight) => highlight.role === 'result') ||
    activeRangeHighlights.some((highlight) => highlight.role === 'result');
  // Whether the matched row itself (see .sheet-viewer__highlight-matched-row) is tinted on the
  // currently displayed sheet — its own legend entry, separate from the search/result swatches
  // above, since it's a third, distinct color rather than a re-explanation of either of those.
  const hasMatchedRowHighlight = cellHighlight !== null && cellHighlight.resultSheetIndex === activeSheetIndex && cellHighlightRowIndex !== null;

  return (
    <div className="sheet-viewer">
      {columnPicker && (
        <p className="sheet-viewer__picker-banner">Clique numa coluna da tabela para a selecionar.</p>
      )}

      {rangePicker && (
        <p className="sheet-viewer__picker-banner">
          Arraste sobre as células para selecionar um intervalo, ou clique (ou arraste) no cabeçalho de uma coluna para a selecionar
          por inteiro.
        </p>
      )}

      {dataset.sheets.length > 1 && (
        <div className="sheet-viewer__tabs">
          {dataset.sheets.map((sheet, index) => (
            <button
              key={sheet.sheetName}
              type="button"
              disabled={tabsDisabled}
              className={index === activeSheetIndex ? 'sheet-viewer__tab sheet-viewer__tab--active' : 'sheet-viewer__tab'}
              onClick={() => onActiveSheetIndexChange(index)}
            >
              {sheet.sheetName}
            </button>
          ))}
        </div>
      )}

      {(hasSearchHighlight || hasResultHighlight || hasMatchedRowHighlight) && (
        <div className="sheet-viewer__legend">
          {hasSearchHighlight && (
            <span className="sheet-viewer__legend-item">
              <span className="sheet-viewer__legend-swatch sheet-viewer__legend-swatch--search" aria-hidden="true" />
              {searchLabel}
            </span>
          )}
          {hasResultHighlight && (
            <span className="sheet-viewer__legend-item">
              <span className="sheet-viewer__legend-swatch sheet-viewer__legend-swatch--result" aria-hidden="true" />
              {resultLabel}
            </span>
          )}
          {hasMatchedRowHighlight && (
            <span className="sheet-viewer__legend-item">
              <span className="sheet-viewer__legend-swatch sheet-viewer__legend-swatch--matched-row" aria-hidden="true" />
              Valor de saída
            </span>
          )}
        </div>
      )}

      <div className="sheet-viewer__table-wrapper" ref={wrapperRef}>
        <table className="sheet-viewer__table">
          <thead>
            <tr>
              <th className="sheet-viewer__row-index-header" />
              {columnIndexes.map((columnIndex) => {
                const isSelected = columnPicker?.selectedColumn === columnIndex;
                const isHeaderInDragPreview =
                  dragPreviewRange !== null && columnIndex >= dragPreviewRange.startColumn && columnIndex <= dragPreviewRange.endColumn;
                const columnHighlightRole = columnHighlightRoles.get(columnIndex);
                const headerClassNames = [
                  'sheet-viewer__col-header',
                  columnPicker || rangePicker ? 'sheet-viewer__col-header--pickable' : null,
                  isSelected || isHeaderInDragPreview ? 'sheet-viewer__col-header--selected' : null,
                  columnHighlightRole === 'search' ? 'sheet-viewer__highlight-search' : null,
                  columnHighlightRole === 'result' ? 'sheet-viewer__highlight-result' : null,
                  columnIndex === cellHighlightSearchColumn ? 'sheet-viewer__highlight-search' : null,
                  columnIndex === cellHighlightResultColumn ? 'sheet-viewer__highlight-result' : null,
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <th
                    key={columnIndex}
                    data-column={columnIndex}
                    className={headerClassNames}
                    onClick={columnPicker ? () => onColumnHeaderClick?.(columnIndex) : undefined}
                    onMouseDown={
                      rangePicker
                        ? (event) => {
                            event.preventDefault();
                            setDragAnchor({ row: minRowIndex, column: columnIndex });
                            setDragFocus({ row: maxRowIndex, column: columnIndex });
                          }
                        : undefined
                    }
                    onMouseEnter={
                      columnPicker
                        ? () => setHoveredColumn(columnIndex)
                        : rangePicker && dragAnchor
                          ? () => setDragFocus({ row: maxRowIndex, column: columnIndex })
                          : undefined
                    }
                    onMouseLeave={columnPicker ? () => setHoveredColumn(null) : undefined}
                  >
                    {columnIndex}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.map((row) => (
              <tr key={row.rowIndex} data-row={row.rowIndex}>
                <th className="sheet-viewer__row-index">{row.rowIndex}</th>
                {columnIndexes.map((columnIndex) => {
                  const columnHighlightRole = columnHighlightRoles.get(columnIndex);
                  const rangeHighlightRole = rangeHighlightRoleAt(row.rowIndex, columnIndex);
                  const isMatchedRow = row.rowIndex === cellHighlightRowIndex;
                  const isInDragPreview = dragPreviewRange !== null && isWithinRange(row.rowIndex, columnIndex, dragPreviewRange);
                  const cellClassNames = [
                    columnPicker?.selectedColumn === columnIndex ? 'sheet-viewer__cell--selected-column' : null,
                    columnPicker && hoveredColumn === columnIndex ? 'sheet-viewer__cell--hovered-column' : null,
                    rangePicker ? 'sheet-viewer__cell--range-pickable' : null,
                    isMatchedRow ? 'sheet-viewer__highlight-matched-row' : null,
                    columnHighlightRole === 'search' ? 'sheet-viewer__highlight-search' : null,
                    columnHighlightRole === 'result' ? 'sheet-viewer__highlight-result' : null,
                    rangeHighlightRole === 'search' ? 'sheet-viewer__highlight-search' : null,
                    rangeHighlightRole === 'result' ? 'sheet-viewer__highlight-result' : null,
                    isMatchedRow && columnIndex === cellHighlightSearchColumn ? 'sheet-viewer__highlight-search-cell' : null,
                    isMatchedRow && columnIndex === cellHighlightResultColumn ? 'sheet-viewer__highlight-result-cell' : null,
                    activeMatchedCells.some((cell) => cell.row === row.rowIndex && cell.column === columnIndex && cell.role === 'search')
                      ? 'sheet-viewer__highlight-search-cell'
                      : null,
                    activeMatchedCells.some((cell) => cell.row === row.rowIndex && cell.column === columnIndex && cell.role === 'result')
                      ? 'sheet-viewer__highlight-result-cell'
                      : null,
                    isInDragPreview ? 'sheet-viewer__cell--range-preview' : null,
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <td
                      key={columnIndex}
                      className={cellClassNames || undefined}
                      onMouseDown={
                        rangePicker
                          ? (event) => {
                              event.preventDefault();
                              setDragAnchor({ row: row.rowIndex, column: columnIndex });
                              setDragFocus({ row: row.rowIndex, column: columnIndex });
                            }
                          : undefined
                      }
                      onMouseEnter={
                        rangePicker && dragAnchor ? () => setDragFocus({ row: row.rowIndex, column: columnIndex }) : undefined
                      }
                    >
                      {formatCellValue(findCellValue(row, columnIndex))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
