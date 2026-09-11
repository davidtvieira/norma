import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { KINDS_BY_ID, OPERATION_KIND_IDS } from './components/OperationPanel/kinds/registry';
import { useTheme } from './hooks/useTheme';
import type { DatasetImportResponse } from './types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from './types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from './types/highlight';
import type { CellRange } from './types/cellRange';
import { getInputSource } from './types/valueSource';
import { buildModelExport, parseModelImport, type SerializableEntry } from './utils/modelSerialization';
import { LandingScreen } from './screens/LandingScreen';
import { UtilizeScreen, type UtilizeModel } from './screens/UtilizeScreen';
import { ChooseModelScreen, type ImportedModel } from './screens/ChooseModelScreen';
import { EditorScreen } from './screens/EditorScreen';
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
  const [importedModel, setImportedModel] = useState<ImportedModel | null>(null);
  // Set once a model is being utilized (not edited) — switches to the ModelCard screen instead
  // of the full editor for as long as it's non-null.
  const [utilizeModel, setUtilizeModel] = useState<UtilizeModel | null>(null);
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
  const inputLabels =
    modelInputIds.length > 0
      ? modelInputIds
          .map((id) => modelInputOptions.find((option) => option.id === id)?.label)
          .filter((label): label is string => Boolean(label))
      : isModelInputRequired
        ? null
        : ['nenhum (modelo fixo)'];
  const outputLabels =
    modelOutputIds.length > 0
      ? modelOutputIds
          .map((id) => modelOutputOptions.find((option) => option.id === id)?.label)
          .filter((label): label is string => Boolean(label))
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
    return <LandingScreen theme={theme} onToggleTheme={toggleTheme} onImportSuccess={setDataset} />;
  }

  if (utilizeModel) {
    return (
      <UtilizeScreen
        dataset={dataset}
        utilizeModel={utilizeModel}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => setUtilizeModel(null)}
      />
    );
  }

  if (!modelCreated) {
    return (
      <ChooseModelScreen
        dataset={dataset}
        importedModel={importedModel}
        importError={importError}
        theme={theme}
        onToggleTheme={toggleTheme}
        importFileInputRef={importFileInputRef}
        onCreateFresh={goToEditorFresh}
        onTriggerImportModel={triggerImportModel}
        onImportModelFile={handleImportModelFile}
        onEditImportedModel={goToEditorWithImportedModel}
        onUtilizeImportedModel={goToUtilizeWithImportedModel}
        onCancelImportedModel={cancelImportedModel}
        onBackToLanding={() => setDataset(null)}
      />
    );
  }

  return (
    <EditorScreen
      dataset={dataset}
      theme={theme}
      onToggleTheme={toggleTheme}
      onBackToChoose={() => setModelCreated(false)}
      modelName={modelName}
      onModelNameChange={setModelName}
      pendingImportEntries={pendingImportEntries}
      columnPick={columnPick}
      onStartColumnPick={startColumnPick}
      onFinishColumnPick={finishColumnPick}
      onPickColumn={pickColumn}
      rangePick={rangePick}
      onStartRangePick={startRangePick}
      onFinishRangePick={finishRangePick}
      onPickRange={pickRange}
      onColumnHighlightsChange={setColumnHighlights}
      onRangeHighlightsChange={setRangeHighlights}
      onCellHighlightChange={setCellHighlight}
      onRevealInSheet={revealInSheet}
      onEntriesChange={setModelEntries}
      modelInputIds={modelInputIds}
      modelOutputIds={modelOutputIds}
      onModelInputIdsChange={setModelInputIds}
      onModelOutputIdsChange={setModelOutputIds}
      isSheetPanelOpen={isSheetPanelOpen}
      onOpenSheetPanel={() => setIsSheetPanelOpen(true)}
      onCloseSheetPanel={closeSheetPanel}
      activeSheetIndex={activeSheetIndex}
      onActiveSheetIndexChange={setActiveSheetIndex}
      columnHighlights={columnHighlights}
      rangeHighlights={rangeHighlights}
      cellHighlight={cellHighlight}
      isSaveModalOpen={isSaveModalOpen}
      onOpenSaveModal={() => setIsSaveModalOpen(true)}
      onCloseSaveModal={() => setIsSaveModalOpen(false)}
      onExportModel={exportModel}
      canExportModel={canExportModel}
      exportHint={exportHint}
      inputLabels={inputLabels}
      outputLabels={outputLabels}
    />
  );
}

export default App;
