import { useMemo } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import { findCellValue, formatCellValue, getColumnCount } from '../../utils/sheet';
import './SheetViewer.css';

interface SheetViewerProps {
  dataset: DatasetImportResponse;
  activeSheetIndex: number;
  onActiveSheetIndexChange: (index: number) => void;
}

/**
 * Renders a parsed sheet as an index-addressed row/cell grid.
 */
export function SheetViewer({ dataset, activeSheetIndex, onActiveSheetIndexChange }: SheetViewerProps) {
  const activeSheet = dataset.sheets[activeSheetIndex];

  const columnCount = useMemo(() => getColumnCount(activeSheet), [activeSheet]);

  const columnIndexes = Array.from({ length: columnCount }, (_, index) => index);

  return (
    <div className="sheet-viewer">
      {dataset.sheets.length > 1 && (
        <div className="sheet-viewer__tabs">
          {dataset.sheets.map((sheet, index) => (
            <button
              key={sheet.sheetName}
              type="button"
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
              {columnIndexes.map((columnIndex) => (
                <th key={columnIndex}>{columnIndex}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.map((row) => (
              <tr key={row.rowIndex}>
                <th className="sheet-viewer__row-index">{row.rowIndex}</th>
                {columnIndexes.map((columnIndex) => (
                  <td key={columnIndex}>{formatCellValue(findCellValue(row, columnIndex))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
