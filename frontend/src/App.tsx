import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { DatasetUploader } from './components/DatasetUploader/DatasetUploader';
import { OperationPanel } from './components/OperationPanel/OperationPanel';
import { KINDS_BY_ID, OPERATION_KIND_IDS } from './components/OperationPanel/kinds/registry';
import { ModelCard } from './components/ModelCard/ModelCard';
import { SaveModal } from './components/SaveModal/SaveModal';
import { SheetViewer } from './components/SheetViewer/SheetViewer';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { useTheme } from './hooks/useTheme';
import type { DatasetImportResponse } from './types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from './types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from './types/highlight';
import type { CellRange } from './types/cellRange';
import { getInputSource } from './types/valueSource';
import { buildModelExport, parseModelImport, type SerializableEntry } from './utils/modelSerialization';
import './App.css';

function App() {
  const [dataset, setDataset] = useState<DatasetImportResponse | null>(null);
  const [modelCreated, setModelCreated] = useState(false);
  const [modelName, setModelName] = useState('');
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [columnPick, setColumnPick] = useState<ColumnPickState | null>(null);
  const [rangePick, setRangePick] = useState<RangePickState | null>(null);
  const [columnHighlights, setColumnHighlights] = useState<ColumnHighlight[]>([]);
  const [rangeHighlights, setRangeHighlights] = useState<RangeHighlight[]>([]);
  const [cellHighlight, setCellHighlight] = useState<OperationHighlight | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  // The sheet viewer now lives in an off-canvas panel (more room for the operations list) —
  // closed by default, opened via the "Ver dados" button or automatically whenever a column/
  // range pick starts, since the sheet has to be visible for that.
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  // Mirrors OperationPanel's own entry list (see onEntriesChange) purely so "Guardar modelo" can
  // export it — the panel remains the source of truth while editing.
  const [modelEntries, setModelEntries] = useState<SerializableEntry[]>([]);
  // The model's designated inputs/outputs (see SaveModal) — picked in the save modal rather than
  // while still building the model, so it doesn't compete for attention with the operations
  // themselves. Cleared automatically below if a picked operation stops being eligible. A model
  // can have several of each, each independently toggled on its own node.
  const [modelInputIds, setModelInputIds] = useState<string[]>([]);
  const [modelOutputIds, setModelOutputIds] = useState<string[]>([]);
  // Set right before switching to the editor screen when a model was imported instead of
  // started fresh — consumed once by OperationPanel's initial state on mount.
  const [pendingImportEntries, setPendingImportEntries] = useState<SerializableEntry[] | undefined>(undefined);
  const [importError, setImportError] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  // Set once "Importar Modelo" has loaded a file — the ready screen then offers "Editar Modelo"
  // / "Utilizar Modelo" for this same imported model instead of the initial Criar/Importar choice.
  const [importedModel, setImportedModel] = useState<{
    modelName: string;
    entries: SerializableEntry[];
    inputOperationIds: string[];
    outputOperationIds: string[];
  } | null>(null);
  // Set once a model is being utilized (not edited) — switches to the ModelCard screen instead
  // of the full editor for as long as it's non-null.
  const [utilizeModel, setUtilizeModel] = useState<{
    modelName: string;
    entries: SerializableEntry[];
    inputOperationIds: string[];
    outputOperationIds: string[];
  } | null>(null);
  const { theme, toggleTheme } = useTheme();

  // Only a confirmed operation whose kind has an editable chainable input (see
  // OperationKind.renderInputEditor), and that isn't itself already chained off another
  // operation, can be the model's input — otherwise there'd be nothing literal left for a caller
  // of the model to fill in. Any confirmed operation's result can be the output.
  const modelInputOptions = modelEntries
    .filter((entry) => entry.confirmed && KINDS_BY_ID[entry.kindId].renderInputEditor && getInputSource(entry.fields).type === 'literal')
    .map((entry) => ({ id: entry.id, label: entry.name || 'Operação sem nome' }));
  const modelOutputOptions = modelEntries
    .filter((entry) => entry.confirmed)
    .map((entry) => ({ id: entry.id, label: entry.name || 'Operação sem nome' }));

  // An input is only required to export when there's actually an eligible operation for it —
  // e.g. a model built only from a sum has no literal chainable field anywhere, so it's a fixed
  // model with nothing dynamic for a caller to fill in, and shouldn't need one picked. At least
  // one must be picked once any are eligible — same guard rail as before, just no longer capping
  // it at exactly one. An output is still always required once there's a confirmed operation at
  // all (same "at least one" rule, unconditional rather than gated by eligibility — any confirmed
  // operation can be an output): modelOutputOptions can only be empty when modelEntries has no
  // confirmed entry, which the check below already covers.
  const hasConfirmedEntry = modelEntries.some((entry) => entry.confirmed);
  const isModelInputRequired = modelInputOptions.length > 0;
  const canExportModel = hasConfirmedEntry && (!isModelInputRequired || modelInputIds.length > 0) && modelOutputIds.length > 0;
  const exportHint = !hasConfirmedEntry
    ? 'Conclua pelo menos uma operação antes de exportar.'
    : isModelInputRequired && modelInputIds.length === 0
      ? 'Defina pelo menos um input do modelo (botão "Input" numa operação elegível) antes de exportar.'
      : modelOutputIds.length === 0
        ? 'Defina pelo menos um output do modelo (botão "Output" numa operação) antes de exportar.'
        : null;

  // Clears any pick that's no longer valid — the operation was deleted, un-confirmed, or switched
  // to a dynamic/reference value after being picked — instead of silently exporting a model that
  // points at something stale.
  useEffect(() => {
    setModelInputIds((current) => {
      const next = current.filter((id) => modelInputOptions.some((option) => option.id === id));
      return next.length === current.length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelEntries]);

  useEffect(() => {
    setModelOutputIds((current) => {
      const next = current.filter((id) => modelOutputOptions.some((option) => option.id === id));
      return next.length === current.length ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelEntries]);

  // Auto-open the sheet panel whenever a pick starts, wherever it was triggered from (the panel
  // itself, if already open, just keeps showing).
  useEffect(() => {
    if (columnPick || rangePick) {
      setIsSheetPanelOpen(true);
    }
  }, [columnPick, rangePick]);

  // ...and auto-close it once a column pick ends — a single clicked column is unambiguous, so
  // there's nothing left to confirm with the sheet still visible. A range pick is left open on
  // purpose: unlike a column, the selected rectangle isn't obvious at a glance, so closing the
  // moment the drag ends would make it harder to actually check what got selected — the user
  // closes it manually once they've confirmed it (×, backdrop, or Escape). Tracked via a ref
  // rather than derived directly, so opening the panel by hand (the "Ver dados" button, with no
  // pick involved at all) never gets swept up and closed by this effect.
  const wasPickingColumnRef = useRef(false);
  useEffect(() => {
    const isPickingColumn = columnPick !== null;
    if (wasPickingColumnRef.current && !isPickingColumn) {
      setIsSheetPanelOpen(false);
    }
    wasPickingColumnRef.current = isPickingColumn;
  }, [columnPick]);

  // Closing the panel while a pick is in progress cancels it too — there's nothing useful left
  // to pick from once the sheet is hidden.
  function closeSheetPanel() {
    if (columnPick) finishColumnPick();
    if (rangePick) finishRangePick();
    setIsSheetPanelOpen(false);
  }

  useEffect(() => {
    if (!isSheetPanelOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeSheetPanel();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetPanelOpen, columnPick, rangePick]);

  function startColumnPick(entryId: string, field: ColumnPickField, sheetIndex: number) {
    setColumnPick({ entryId, field, sheetIndex, column: null });
  }

  function finishColumnPick() {
    setColumnPick(null);
  }

  function pickColumn(columnIndex: number) {
    setColumnPick((current) => (current ? { ...current, column: columnIndex } : current));
  }

  function startRangePick(entryId: string, sheetIndex: number) {
    setRangePick({ entryId, sheetIndex, range: null });
  }

  function finishRangePick() {
    setRangePick(null);
  }

  function pickRange(range: CellRange) {
    setRangePick((current) => (current ? { ...current, range } : current));
  }

  // The click counterpart to OperationPanel's hover-driven sheet tinting (see RevealButton) —
  // hovering only shows a highlight if the panel already happens to be open, so this actually
  // opens it (and switches to the operation's own sheet) instead of just tinting whatever's
  // already visible.
  function revealInSheet(sheetIndex: number) {
    setActiveSheetIndex(sheetIndex);
    setIsSheetPanelOpen(true);
  }

  function goToEditorFresh() {
    setPendingImportEntries(undefined);
    setModelInputIds([]);
    setModelOutputIds([]);
    setIsSheetPanelOpen(false);
    setModelCreated(true);
  }

  function triggerImportModel() {
    setImportError(null);
    importFileInputRef.current?.click();
  }

  function handleImportModelFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-importing the same file path fires onChange again
    if (!file) return;

    file
      .text()
      .then((text) => {
        // Not checked against the current dataset's id for now: a fresh page load gets a new
        // dataset id from the server even for the same uploaded file, which would otherwise
        // block re-importing a model exported earlier in the same session.
        const imported = parseModelImport(text, OPERATION_KIND_IDS);
        setImportedModel({
          modelName: imported.modelName,
          entries: imported.entries,
          inputOperationIds: imported.inputOperationIds,
          outputOperationIds: imported.outputOperationIds,
        });
        setImportError(null);
      })
      .catch((error) => {
        setImportedModel(null);
        setImportError(error instanceof Error ? error.message : 'Falha ao importar o modelo.');
      });
  }

  function cancelImportedModel() {
    setImportedModel(null);
    setImportError(null);
  }

  function goToEditorWithImportedModel() {
    if (!importedModel) return;
    setModelName(importedModel.modelName);
    setPendingImportEntries(importedModel.entries);
    setModelInputIds(importedModel.inputOperationIds);
    setModelOutputIds(importedModel.outputOperationIds);
    setIsSheetPanelOpen(false);
    setModelCreated(true);
  }

  function goToUtilizeWithImportedModel() {
    if (!importedModel) return;
    setUtilizeModel(importedModel);
  }

  function exportModel() {
    if (!dataset) return;
    const model = buildModelExport(modelEntries, modelName, dataset.datasetId, modelInputIds, modelOutputIds);
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${modelName.trim() || 'modelo'}.json`;
    link.click();
    URL.revokeObjectURL(url);
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

  if (utilizeModel) {
    return (
      <div className="app app--landing">
        <header className="app__topbar app__topbar--with-title">
          <nav className="app__breadcrumbs" aria-label="Breadcrumb">
            <button type="button" className="app__breadcrumb-item" onClick={() => setUtilizeModel(null)}>
              {dataset.filename}
            </button>
            <span className="app__breadcrumb-separator">/</span>
            <span className="app__breadcrumb-item app__breadcrumb-item--current">
              {utilizeModel.modelName || 'Modelo sem nome'}
            </span>
          </nav>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <div className="app__utilize-body">
          <ModelCard
            dataset={dataset}
            modelName={utilizeModel.modelName}
            entries={utilizeModel.entries}
            inputOperationIds={utilizeModel.inputOperationIds}
            outputOperationIds={utilizeModel.outputOperationIds}
            onBack={() => setUtilizeModel(null)}
          />
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
        <header className="app__topbar app__topbar--with-title">
          <nav className="app__breadcrumbs" aria-label="Breadcrumb">
            <span className="app__breadcrumb-item app__breadcrumb-item--current">{dataset.filename}</span>
          </nav>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <div className="app__create-model-body">
          <div className="app__create-model-content">
            <p className="app__create-model-eyebrow">{importedModel ? importedModel.modelName || 'Modelo sem nome' : dataset.filename}</p>
            <h1 className="app__create-model-title">
              {importedModel ? 'O modelo foi importado.' : 'O seu conjunto de dados está pronto.'}
            </h1>
            <p className="app__create-model-hint">
              {importedModel ? 'O que pretende fazer com o modelo importado?' : 'Escolha uma das opções abaixo para começar.'}
            </p>
            <div className="app__create-model-actions">
              {importedModel ? (
                <>
                  <button type="button" className="app__create-model-button" onClick={goToEditorWithImportedModel}>
                    Editar Modelo
                  </button>
                  <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={goToUtilizeWithImportedModel}>
                    Utilizar Modelo
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="app__create-model-button" onClick={goToEditorFresh}>
                    Criar Modelo
                  </button>
                  <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={triggerImportModel}>
                    Importar Modelo
                  </button>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept="application/json"
                    className="app__import-model-file-input"
                    onChange={handleImportModelFile}
                  />
                </>
              )}
            </div>

            <button
              type="button"
              className="app__create-model-button app__create-model-button--back"
              onClick={importedModel ? cancelImportedModel : () => setDataset(null)}
            >
              {importedModel ? '← Voltar' : '← Importar outro conjunto de dados'}
            </button>

            {importError && <p className="app__create-model-error">{importError}</p>}
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
        <div className="app__topbar-actions">
          <button type="button" className="app__view-data-button" onClick={() => setIsSheetPanelOpen(true)}>
            Ver dados
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="app__main">
        <div className="app__main-content">
          <input
            type="text"
            className="app__model-name-input"
            placeholder="Nome do modelo"
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
          />
          <OperationPanel
            dataset={dataset}
            initialEntries={pendingImportEntries}
            columnPick={columnPick}
            onStartColumnPick={startColumnPick}
            onFinishColumnPick={finishColumnPick}
            rangePick={rangePick}
            onStartRangePick={startRangePick}
            onFinishRangePick={finishRangePick}
            onColumnHighlightsChange={setColumnHighlights}
            onRangeHighlightsChange={setRangeHighlights}
            onCellHighlightChange={setCellHighlight}
            onRevealInSheet={revealInSheet}
            onOperationConfirmed={closeSheetPanel}
            isSheetPanelOpen={isSheetPanelOpen}
            onEntriesChange={setModelEntries}
            modelInputIds={modelInputIds}
            modelOutputIds={modelOutputIds}
            onModelInputIdsChange={setModelInputIds}
            onModelOutputIdsChange={setModelOutputIds}
            modelName={modelName}
          />
          <button type="button" className="app__save-button" onClick={() => setIsSaveModalOpen(true)}>
            Guardar modelo
          </button>
        </div>
      </main>

      <footer className="app__footer">
        <h1 className="app__brand">Norma</h1>
      </footer>

      <div
        className={isSheetPanelOpen ? 'sheet-panel__backdrop sheet-panel__backdrop--visible' : 'sheet-panel__backdrop'}
        onClick={closeSheetPanel}
        aria-hidden="true"
      />
      <aside className={isSheetPanelOpen ? 'sheet-panel sheet-panel--open' : 'sheet-panel'} aria-hidden={!isSheetPanelOpen}>
        <div className="sheet-panel__header">
          <span className="sheet-panel__title">{dataset.filename}</span>
          <button type="button" className="sheet-panel__close" onClick={closeSheetPanel} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="sheet-panel__body">
          <SheetViewer
            dataset={dataset}
            activeSheetIndex={columnPick ? columnPick.sheetIndex : rangePick ? rangePick.sheetIndex : activeSheetIndex}
            onActiveSheetIndexChange={setActiveSheetIndex}
            tabsDisabled={columnPick !== null || rangePick !== null}
            columnPicker={columnPick ? { selectedColumn: columnPick.column } : null}
            onColumnHeaderClick={pickColumn}
            rangePicker={rangePick !== null}
            onRangeSelected={pickRange}
            columnHighlights={columnHighlights}
            rangeHighlights={rangeHighlights}
            cellHighlight={cellHighlight}
          />
        </div>
      </aside>

      <SaveModal
        open={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onExport={exportModel}
        canExport={canExportModel}
        exportHint={exportHint}
        inputLabels={
          modelInputIds.length > 0
            ? modelInputIds
                .map((id) => modelInputOptions.find((option) => option.id === id)?.label)
                .filter((label): label is string => Boolean(label))
            : isModelInputRequired
              ? null
              : ['nenhum (modelo fixo)']
        }
        outputLabels={
          modelOutputIds.length > 0
            ? modelOutputIds
                .map((id) => modelOutputOptions.find((option) => option.id === id)?.label)
                .filter((label): label is string => Boolean(label))
            : null
        }
      />
    </div>
  );
}

export default App;
