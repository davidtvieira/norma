import { useMemo, useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import type { ColumnHighlight, ConditionHighlight } from '../../types/highlight';
import { findCellValue, formatCellValue, getColumnCount } from '../../utils/sheet';
import './SheetViewer.css';

interface ColumnPicker {
  selectedColumn: number | null;
}

interface SheetViewerProps {
  dataset: DatasetImportResponse;
  activeSheetIndex: number;
  onActiveSheetIndexChange: (index: number) => void;
  tabsDisabled?: boolean;
  columnPicker?: ColumnPicker | null;
  onColumnHeaderClick?: (columnIndex: number) => void;
  columnHighlights?: ColumnHighlight[];
  cellHighlight?: ConditionHighlight | null;
}

/**
 * Renders a parsed sheet as an index-addressed row/cell grid. When `columnPicker` is set,
 * column headers become clickable so a lookup condition can pick a column directly from
 * the table instead of a dropdown; tabs lock to the sheet being picked from.
 * `columnHighlights` tints whole search/result columns for conditions being built or edited.
 * `cellHighlight` marks the exact input/output cell of a confirmed condition's current match,
 * shown while hovering its card. Only whatever belongs to the currently displayed sheet lights up.
 */
export function SheetViewer({
  dataset,
  activeSheetIndex,
  onActiveSheetIndexChange,
  tabsDisabled = false,
  columnPicker = null,
  onColumnHeaderClick,
  columnHighlights = [],
  cellHighlight = null,
}: SheetViewerProps) {
  const activeSheet = dataset.sheets[activeSheetIndex];
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);

  const columnCount = useMemo(() => getColumnCount(activeSheet), [activeSheet]);

  const columnIndexes = Array.from({ length: columnCount }, (_, index) => index);

  const columnHighlightRoles = useMemo(() => {
    const roles = new Map<number, 'search' | 'result'>();
    for (const highlight of columnHighlights) {
      if (highlight.sheetIndex === activeSheetIndex && !roles.has(highlight.column)) {
        roles.set(highlight.column, highlight.role);
      }
    }
    return roles;
  }, [columnHighlights, activeSheetIndex]);

  const cellHighlightSearchColumn =
    cellHighlight && cellHighlight.searchSheetIndex === activeSheetIndex ? cellHighlight.searchColumn : null;
  const cellHighlightResultColumn =
    cellHighlight && cellHighlight.resultSheetIndex === activeSheetIndex ? cellHighlight.resultColumn : null;
  const cellHighlightRowIndex = cellHighlight?.rowIndex ?? null;

  return (
    <div className="sheet-viewer">
      {columnPicker && (
        <p className="sheet-viewer__picker-banner">Clique numa coluna da tabela para a selecionar.</p>
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

      <div className="sheet-viewer__table-wrapper">
        <table className="sheet-viewer__table">
          <thead>
            <tr>
              <th className="sheet-viewer__row-index-header" />
              {columnIndexes.map((columnIndex) => {
                const isSelected = columnPicker?.selectedColumn === columnIndex;
                const columnHighlightRole = columnHighlightRoles.get(columnIndex);
                const headerClassNames = [
                  'sheet-viewer__col-header',
                  columnPicker ? 'sheet-viewer__col-header--pickable' : null,
                  isSelected ? 'sheet-viewer__col-header--selected' : null,
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
                    onMouseEnter={columnPicker ? () => setHoveredColumn(columnIndex) : undefined}
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
                  const isMatchedRow = row.rowIndex === cellHighlightRowIndex;
                  const cellClassNames = [
                    columnPicker?.selectedColumn === columnIndex ? 'sheet-viewer__cell--selected-column' : null,
                    columnPicker && hoveredColumn === columnIndex ? 'sheet-viewer__cell--hovered-column' : null,
                    columnHighlightRole === 'search' ? 'sheet-viewer__highlight-search' : null,
                    columnHighlightRole === 'result' ? 'sheet-viewer__highlight-result' : null,
                    isMatchedRow && columnIndex === cellHighlightSearchColumn ? 'sheet-viewer__highlight-search-cell' : null,
                    isMatchedRow && columnIndex === cellHighlightResultColumn ? 'sheet-viewer__highlight-result-cell' : null,
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <td key={columnIndex} className={cellClassNames || undefined}>
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
