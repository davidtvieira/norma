import { useLayoutEffect, useMemo, useState } from 'react';
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
}: SheetViewerProps) {
  const activeSheet = dataset.sheets[activeSheetIndex];
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const [dragAnchor, setDragAnchor] = useState<CellPosition | null>(null);
  const [dragFocus, setDragFocus] = useState<CellPosition | null>(null);

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
  const resultLabel =
    activeColumnHighlights.find((highlight) => highlight.role === 'result' && highlight.label)?.label ??
    activeRangeHighlights.find((highlight) => highlight.role === 'result' && highlight.label)?.label ??
    'O que devolve';
  const hasSearchHighlight =
    cellHighlightSearchColumn !== null ||
    activeColumnHighlights.some((highlight) => highlight.role === 'search') ||
    activeRangeHighlights.some((highlight) => highlight.role === 'search');
  const hasResultHighlight =
    cellHighlightResultColumn !== null ||
    activeColumnHighlights.some((highlight) => highlight.role === 'result') ||
    activeRangeHighlights.some((highlight) => highlight.role === 'result');

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

      {(hasSearchHighlight || hasResultHighlight) && (
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
        </div>
      )}

      <div className="sheet-viewer__table-wrapper">
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
              <tr key={row.rowIndex}>
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
                    columnHighlightRole === 'search' ? 'sheet-viewer__highlight-search' : null,
                    columnHighlightRole === 'result' ? 'sheet-viewer__highlight-result' : null,
                    rangeHighlightRole === 'search' ? 'sheet-viewer__highlight-search' : null,
                    rangeHighlightRole === 'result' ? 'sheet-viewer__highlight-result' : null,
                    isMatchedRow && columnIndex === cellHighlightSearchColumn ? 'sheet-viewer__highlight-search-cell' : null,
                    isMatchedRow && columnIndex === cellHighlightResultColumn ? 'sheet-viewer__highlight-result-cell' : null,
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
