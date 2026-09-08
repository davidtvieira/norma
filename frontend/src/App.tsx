import { useState } from 'react';
import { DatasetUploader } from './components/DatasetUploader/DatasetUploader';
import { OperationPanel } from './components/OperationPanel/OperationPanel';
import { SheetViewer } from './components/SheetViewer/SheetViewer';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import type { DatasetImportResponse } from './types/dataset';
import type { ColumnPickField, ColumnPickState } from './types/columnPick';
import type { ColumnHighlight, OperationHighlight } from './types/highlight';
import './App.css';

function App() {
  const [dataset, setDataset] = useState<DatasetImportResponse | null>(null);
  const [modelCreated, setModelCreated] = useState(false);
  const [modelName, setModelName] = useState('');
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [columnPick, setColumnPick] = useState<ColumnPickState | null>(null);
  const [columnHighlights, setColumnHighlights] = useState<ColumnHighlight[]>([]);
  const [cellHighlight, setCellHighlight] = useState<OperationHighlight | null>(null);
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

  if (!modelCreated) {
    return (
      <div className="app app--landing">
        <header className="app__topbar">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <div className="app__create-model-body">
          <div className="app__create-model-content">
            <p className="app__create-model-eyebrow">{dataset.filename}</p>
            <h1 className="app__create-model-title">O seu conjunto de dados está pronto.</h1>
            <p className="app__create-model-hint">
              Escolha uma das opções abaixo para começar.
            </p>
            <div className="app__create-model-actions">
              <button type="button" className="app__create-model-button" onClick={() => setModelCreated(true)}>
                Criar Modelo para este conjunto de dados
              </button>
              <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={() => {}}>
                Importar Modelo para este conjunto de dados
              </button>
              <button
                type="button"
                className="app__create-model-button app__create-model-button--back"
                onClick={() => setDataset(null)}
              >
                ← Importar outro conjunto de dados
              </button>
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
      <header className="app__topbar app__topbar--with-title">
        <nav className="app__breadcrumbs" aria-label="Breadcrumb">
          <button type="button" className="app__breadcrumb-item" onClick={() => setModelCreated(false)}>
            {dataset.filename}
          </button>
          <span className="app__breadcrumb-separator">/</span>
          <span className="app__breadcrumb-item app__breadcrumb-item--current">Criar modelo</span>
        </nav>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </header>

      <main className="app__main">
        <div className="app__main-left">
          <input
            type="text"
            className="app__model-name-input"
            placeholder="Nome do modelo"
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
          />
          <OperationPanel
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
