import { useMemo, useState } from 'react';
import type { DatasetImportResponse } from '../../types/dataset';
import './SheetViewer.css';

interface SheetViewerProps {
  dataset: DatasetImportResponse;
}

/**
 * Renders a parsed sheet as an index-addressed row/cell grid.
 */
export function SheetViewer({ dataset }: SheetViewerProps) {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const activeSheet = dataset.sheets[activeSheetIndex];

  const columnCount = useMemo(() => {
    return activeSheet.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  }, [activeSheet]);

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
              onClick={() => setActiveSheetIndex(index)}
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
                {columnIndexes.map((columnIndex) => {
                  const cell = row.cells.find((c) => c.columnIndex === columnIndex);
                  return <td key={columnIndex}>{formatCellValue(cell?.value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCellValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
