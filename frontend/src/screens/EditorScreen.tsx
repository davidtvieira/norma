import { DiskIcon, SpreadsheetIcon } from '../components/ButtonIcons/ButtonIcons';
import { useState } from 'react';
import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { OperationPanel } from '../components/OperationPanel/OperationPanel';
import { SaveModal, type IoItem, type ModelExportFormat } from '../components/SaveModal/SaveModal';
import { SheetPanel } from '../components/SheetPanel/SheetPanel';
import { SheetViewer } from '../components/SheetViewer/SheetViewer';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportResponse } from '../types/dataset';
import type { ColumnPickField, ColumnPickState, RangePickState } from '../types/columnPick';
import type { ColumnHighlight, OperationHighlight, RangeHighlight } from '../types/highlight';
import type { CellRange } from '../types/cellRange';
import type { SerializableEntry } from '../utils/modelSerialization';
import type { Theme } from '../hooks/useTheme';
import type { CategoryNode } from '../types/category';

interface EditorScreenProps {
  dataset: DatasetImportResponse;
  theme: Theme;
  onToggleTheme: () => void;
  onBackToChoose: () => void;

  modelName: string;
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
  /** The model already has an entry in the library: saving updates it. */
  isSavedInLibrary: boolean;
  /** The library's categories (null until known) and the one a first save files the norma under. */
  categories: CategoryNode[] | null;
  saveCategoryId: string | null;
  onSaveCategoryChange: (id: string | null) => void;
  onOpenSaveModal: () => void;
  onCloseSaveModal: () => void;
  onExportModel: (format: ModelExportFormat) => void;
  nrmName: string;
  onNrmNameChange: (name: string) => void;
  canExportModel: boolean;
  exportHint: string | null;
  inputItems: IoItem[];
  outputItems: IoItem[];
  inputEmptyText: string;
  onReorderInputs: (ids: string[]) => void;
  onReorderOutputs: (ids: string[]) => void;

  /** Downloads the model's current designated-input values as a JSON file — sits next to
   * "Guardar modelo" rather than in the canvas toolbar (see App.tsx's own saveTestCase, which
   * reads the same modelEntries/modelInputIds this screen already mirrors up from OperationPanel,
   * so this doesn't need write access to the canvas' own state to do it). */
  onSaveTestCase: () => void;
  onGoHome: () => void;
}

/** The main editor: model name, the operation canvas, "Guardar modelo", and the off-canvas sheet
 * viewer/save modal it drives. */
export function EditorScreen({
  dataset,
  theme,
  onToggleTheme,
  onBackToChoose,
  modelName,
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
  isSavedInLibrary,
  categories,
  saveCategoryId,
  onSaveCategoryChange,
  onOpenSaveModal,
  onCloseSaveModal,
  onExportModel,
  nrmName,
  onNrmNameChange,
  canExportModel,
  exportHint,
  inputItems,
  outputItems,
  inputEmptyText,
  onReorderInputs,
  onReorderOutputs,
  onSaveTestCase,
  onGoHome,
}: EditorScreenProps) {
  // The bottom-left slot OperationPanel draws "Carregar/Limpar teste" into (a state, not a ref, so the
  // panel re-renders once the element exists).
  const [testActionsSlot, setTestActionsSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="app">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBackToChoose} />
        <div className="app__topbar-actions">
          <button type="button" className="app__view-data-button" onClick={onOpenSheetPanel}>
            <SpreadsheetIcon />
            Ver dados
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <main className="app__main">
        <div className="app__main-content">
          <OperationPanel
            testActionsSlot={testActionsSlot}
            onSaveTestCase={onSaveTestCase}
            dataset={dataset}
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
          {/* Same layout as the Utilizar screen: the test-file buttons bottom-left, the main action
              bottom-right. "Carregar/Limpar teste" is rendered by OperationPanel (it owns that state)
              into the empty slot below. */}
          <div className="app__save-row">
            <div className="app__save-row-group">
              <div ref={setTestActionsSlot} className="app__save-row-slot" />
            </div>
            <button type="button" className="app__save-button action-button" onClick={onOpenSaveModal}>
              <DiskIcon />
              {isSavedInLibrary ? 'Atualizar norma' : 'Guardar norma'}
            </button>
          </div>
        </div>
      </main>

      <AppFooter onGoHome={onGoHome} />

      <SheetPanel title={dataset.filename} open={isSheetPanelOpen} onClose={onCloseSheetPanel}>
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
          active={isSheetPanelOpen}
        />
      </SheetPanel>

      <SaveModal
        open={isSaveModalOpen}
        isUpdate={isSavedInLibrary}
        categories={categories}
        categoryId={saveCategoryId}
        onCategoryChange={onSaveCategoryChange}
        onClose={onCloseSaveModal}
        onExport={onExportModel}
        nrmName={nrmName}
        onNrmNameChange={onNrmNameChange}
        nrmNamePlaceholder={modelName.trim() || 'modelo'}
        canExport={canExportModel}
        exportHint={exportHint}
        inputItems={inputItems}
        outputItems={outputItems}
        inputEmptyText={inputEmptyText}
        onReorderInputs={onReorderInputs}
        onReorderOutputs={onReorderOutputs}
      />
    </div>
  );
}
