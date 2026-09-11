import { OperationPanel } from '../components/OperationPanel/OperationPanel';
import { SaveModal } from '../components/SaveModal/SaveModal';
import { SheetViewer } from '../components/SheetViewer/SheetViewer';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportResponse } from '../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../types/highlight';
import type { CellRange } from '../types/cellRange';
import type { SerializableEntry } from '../utils/modelSerialization';
import type { Theme } from '../hooks/useTheme';

interface EditorScreenProps {
  dataset: DatasetImportResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onBackToChoose: () => void;

  modelName: string;
  onModelNameChange: (name: string) => void;
  pendingImportEntries: SerializableEntry[] | undefined;

  columnPick: ColumnPickState | null;
  onStartColumnPick: (entryId: string, field: ColumnPickField, sheetIndex: number) => void;
  onFinishColumnPick: () => void;
  onPickColumn: (columnIndex: number) => void;
  rangePick: RangePickState | null;
  onStartRangePick: (entryId: string, sheetIndex: number) => void;
  onFinishRangePick: () => void;
  onPickRange: (range: CellRange) => void;
  onColumnHighlightsChange: (highlights: ColumnHighlight[]) => void;
  onRangeHighlightsChange: (highlights: RangeHighlight[]) => void;
  onCellHighlightChange: (highlight: OperationHighlight | null) => void;
  onRevealInSheet: (sheetIndex: number) => void;
  onEntriesChange: (entries: SerializableEntry[]) => void;

  modelInputIds: string[];
  modelOutputIds: string[];
  onModelInputIdsChange: (ids: string[]) => void;
  onModelOutputIdsChange: (ids: string[]) => void;

  isSheetPanelOpen: boolean;
  onOpenSheetPanel: () => void;
  onCloseSheetPanel: () => void;
  activeSheetIndex: number;
  onActiveSheetIndexChange: (sheetIndex: number) => void;
  columnHighlights: ColumnHighlight[];
  rangeHighlights: RangeHighlight[];
  cellHighlight: OperationHighlight | null;

  isSaveModalOpen: boolean;
  onOpenSaveModal: () => void;
  onCloseSaveModal: () => void;
  onExportModel: () => void;
  canExportModel: boolean;
  exportHint: string | null;
  inputLabels: string[] | null;
  outputLabels: string[] | null;

  /** Downloads the model's current designated-input values as a JSON file — sits next to
   * "Guardar modelo" rather than in the canvas toolbar (see App.tsx's own saveTestCase, which
   * reads the same modelEntries/modelInputIds this screen already mirrors up from OperationPanel,
   * so this doesn't need write access to the canvas' own state to do it). */
  onSaveTestCase: () => void;
  canSaveTestCase: boolean;
}

/** The main editor: model name, the operation canvas, "Guardar modelo", and the off-canvas sheet
 * viewer/save modal it drives. */
export function EditorScreen({
  dataset,
  theme,
  onToggleTheme,
  onBackToChoose,
  modelName,
  onModelNameChange,
  pendingImportEntries,
  columnPick,
  onStartColumnPick,
  onFinishColumnPick,
  onPickColumn,
  rangePick,
  onStartRangePick,
  onFinishRangePick,
  onPickRange,
  onColumnHighlightsChange,
  onRangeHighlightsChange,
  onCellHighlightChange,
  onRevealInSheet,
  onEntriesChange,
  modelInputIds,
  modelOutputIds,
  onModelInputIdsChange,
  onModelOutputIdsChange,
  isSheetPanelOpen,
  onOpenSheetPanel,
  onCloseSheetPanel,
  activeSheetIndex,
  onActiveSheetIndexChange,
  columnHighlights,
  rangeHighlights,
  cellHighlight,
  isSaveModalOpen,
  onOpenSaveModal,
  onCloseSaveModal,
  onExportModel,
  canExportModel,
  exportHint,
  inputLabels,
  outputLabels,
  onSaveTestCase,
  canSaveTestCase,
}: EditorScreenProps) {
  return (
    <div className="app">
      <header className="app__topbar app__topbar--with-title">
        <nav className="app__breadcrumbs" aria-label="Breadcrumb">
          <button type="button" className="app__breadcrumb-item" onClick={onBackToChoose}>
            {dataset.filename}
          </button>
          <span className="app__breadcrumb-separator">/</span>
          <span className="app__breadcrumb-item app__breadcrumb-item--current">{modelName.trim() || 'Modelo sem nome'}</span>
        </nav>
        <div className="app__topbar-actions">
          <button type="button" className="app__view-data-button" onClick={onOpenSheetPanel}>
            Ver dados
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <main className="app__main">
        <div className="app__main-content">
          <OperationPanel
            dataset={dataset}
            modelName={modelName}
            onModelNameChange={onModelNameChange}
            initialEntries={pendingImportEntries}
            columnPick={columnPick}
            onStartColumnPick={onStartColumnPick}
            onFinishColumnPick={onFinishColumnPick}
            rangePick={rangePick}
            onStartRangePick={onStartRangePick}
            onFinishRangePick={onFinishRangePick}
            onColumnHighlightsChange={onColumnHighlightsChange}
            onRangeHighlightsChange={onRangeHighlightsChange}
            onCellHighlightChange={onCellHighlightChange}
            onRevealInSheet={onRevealInSheet}
            onOperationConfirmed={onCloseSheetPanel}
            isSheetPanelOpen={isSheetPanelOpen}
            onEntriesChange={onEntriesChange}
            modelInputIds={modelInputIds}
            modelOutputIds={modelOutputIds}
            onModelInputIdsChange={onModelInputIdsChange}
            onModelOutputIdsChange={onModelOutputIdsChange}
          />
          <div className="app__save-row">
            <button
              type="button"
              className="app__save-button app__save-button--secondary"
              onClick={onSaveTestCase}
              disabled={!canSaveTestCase}
              title={canSaveTestCase ? 'Guarda os valores atuais dos inputs num ficheiro JSON.' : 'O modelo não tem nenhum input definido.'}
            >
              Guardar teste
            </button>
            <button type="button" className="app__save-button" onClick={onOpenSaveModal}>
              Guardar modelo
            </button>
          </div>
        </div>
      </main>

      <footer className="app__footer">
        <h1 className="app__brand">Norma</h1>
      </footer>

      <div
        className={isSheetPanelOpen ? 'sheet-panel__backdrop sheet-panel__backdrop--visible' : 'sheet-panel__backdrop'}
        onClick={onCloseSheetPanel}
        aria-hidden="true"
      />
      <aside className={isSheetPanelOpen ? 'sheet-panel sheet-panel--open' : 'sheet-panel'} aria-hidden={!isSheetPanelOpen}>
        <div className="sheet-panel__header">
          <span className="sheet-panel__title">{dataset.filename}</span>
          <button type="button" className="sheet-panel__close" onClick={onCloseSheetPanel} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="sheet-panel__body">
          <SheetViewer
            dataset={dataset}
            activeSheetIndex={columnPick ? columnPick.sheetIndex : rangePick ? rangePick.sheetIndex : activeSheetIndex}
            onActiveSheetIndexChange={onActiveSheetIndexChange}
            tabsDisabled={columnPick !== null || rangePick !== null}
            columnPicker={columnPick ? { selectedColumn: columnPick.column } : null}
            onColumnHeaderClick={onPickColumn}
            rangePicker={rangePick !== null}
            onRangeSelected={onPickRange}
            columnHighlights={columnHighlights}
            rangeHighlights={rangeHighlights}
            cellHighlight={cellHighlight}
          />
        </div>
      </aside>

      <SaveModal
        open={isSaveModalOpen}
        onClose={onCloseSaveModal}
        onExport={onExportModel}
        canExport={canExportModel}
        exportHint={exportHint}
        inputLabels={inputLabels}
        outputLabels={outputLabels}
      />
    </div>
  );
}
