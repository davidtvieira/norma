import { useState } from 'react';
import { DatasetUploader } from './components/DatasetUploader/DatasetUploader';
import { LookupPanel } from './components/LookupPanel/LookupPanel';
import { SheetViewer } from './components/SheetViewer/SheetViewer';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import type { DatasetImportResponse } from './types/dataset';
import type { ColumnPickField, ColumnPickState } from './types/columnPick';
import type { ColumnHighlight, ConditionHighlight } from './types/highlight';
import './App.css';

function App() {
  const [dataset, setDataset] = useState<DatasetImportResponse | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [columnPick, setColumnPick] = useState<ColumnPickState | null>(null);
  const [columnHighlights, setColumnHighlights] = useState<ColumnHighlight[]>([]);
  const [cellHighlight, setCellHighlight] = useState<ConditionHighlight | null>(null);
  const { theme, toggleTheme } = useTheme();

  function startColumnPick(entryId: string, field: ColumnPickField, sheetIndex: number) {
    setColumnPick({ entryId, field, sheetIndex, column: null });
  }

  function finishColumnPick() {
    setColumnPick(null);
  }

  function pickColumn(columnIndex: number) {
    setColumnPick((current) => (current ? { ...current, column: columnIndex } : current));
  }

  if (!dataset) {
    return (
      <div className="app app--landing">
        <header className="app__topbar">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <div className="app__landing-body">
          <div className="app__landing-left">
            <p className="app__intro">Importe um ficheiro de dados para começar a criar um modelo inteligente.</p>
          </div>
          <div className="app__landing-right">
            <div className="app__landing-content">
              <DatasetUploader onImportSuccess={setDataset} />
            </div>
          </div>
        </div>

        <footer className="app__footer">
          <h1 className="app__brand">Norma</h1>
        </footer>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app__topbar">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <main className="app__main">
        <div className="app__main-left">
          <LookupPanel
            dataset={dataset}
            columnPick={columnPick}
            onStartColumnPick={startColumnPick}
            onFinishColumnPick={finishColumnPick}
            onColumnHighlightsChange={setColumnHighlights}
            onCellHighlightChange={setCellHighlight}
          />
        </div>
        <div className="app__main-right">
          <SheetViewer
            dataset={dataset}
            activeSheetIndex={columnPick ? columnPick.sheetIndex : activeSheetIndex}
            onActiveSheetIndexChange={setActiveSheetIndex}
            tabsDisabled={columnPick !== null}
            columnPicker={columnPick ? { selectedColumn: columnPick.column } : null}
            onColumnHeaderClick={pickColumn}
            columnHighlights={columnHighlights}
            cellHighlight={cellHighlight}
          />
        </div>
      </main>

      <footer className="app__footer">
        <h1 className="app__brand">Norma</h1>
      </footer>
    </div>
  );
}

export default App;
