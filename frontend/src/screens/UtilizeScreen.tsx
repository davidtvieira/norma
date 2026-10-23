import { useState } from 'react';
import { SpreadsheetIcon } from '../components/ButtonIcons/ButtonIcons';
import { SheetViewer, type MatchedCell } from '../components/SheetViewer/SheetViewer';
import { useDatasetSheets } from '../hooks/useDatasetSheets';
import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ModelCard } from '../components/ModelCard/ModelCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetHandle } from '../types/dataset';
import type { ColumnHighlight, RangeHighlight } from '../types/highlight';
import type { DatasetTouchPayload, ModelInputFieldPayload } from '../types/modelCalculation';
import type { Theme } from '../hooks/useTheme';

export interface UtilizeModel {
  modelName: string;
  /** The backend-registered model's id (empty when the model has no output, so there's nothing to
   * register) plus its inputs — never its operations or outputs. */
  modelId: string;
  /** Set instead of modelId's registration when the model came with an imported .nrm: the .nrm's id,
   * by which its inputs and runs are addressed. */
  nrmId?: string;
  /** The real dataset id a non-.nrm model was registered against (the screen's `dataset` id can be a
   * .nrm's, see DatasetHandle) — what runs address it by. */
  datasetId?: string;
  inputs: ModelInputFieldPayload[];
}

interface UtilizeScreenProps {
  dataset: DatasetHandle;
  utilizeModel: UtilizeModel;
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onGoHome: () => void;
}

/** The dataset's sheets, read-only. Only mounted once "Ver dados" is first opened, so the sheets are
 * not downloaded for a model that is just being run. */
interface DataHighlights {
  columns: ColumnHighlight[];
  ranges: RangeHighlight[];
  cells: MatchedCell[];
}

const NO_HIGHLIGHTS: DataHighlights = { columns: [], ranges: [], cells: [] };

/** What a run's output read, as the sheet viewer's own highlight kinds. */
function highlightsFromTouches(touches: DatasetTouchPayload[]): DataHighlights {
  const highlights: DataHighlights = { columns: [], ranges: [], cells: [] };
  for (const touch of touches) {
    if (touch.shape === 'column') {
      highlights.columns.push({ sheetIndex: touch.sheetIndex, column: touch.startColumn, role: touch.role, label: touch.label ?? undefined });
    } else if (touch.shape === 'range') {
      highlights.ranges.push({
        sheetIndex: touch.sheetIndex,
        startRow: touch.startRow,
        endRow: touch.endRow,
        startColumn: touch.startColumn,
        endColumn: touch.endColumn,
        role: touch.role,
        label: touch.label ?? undefined,
      });
    } else {
      highlights.cells.push({ sheetIndex: touch.sheetIndex, row: touch.startRow, column: touch.startColumn, role: touch.role });
    }
  }
  return highlights;
}

function DataViewer({
  dataset,
  activeSheetIndex,
  onActiveSheetIndexChange,
  highlights,
}: {
  dataset: DatasetHandle;
  activeSheetIndex: number;
  onActiveSheetIndexChange: (index: number) => void;
  highlights: DataHighlights;
}) {
  const { dataset: sheets, error } = useDatasetSheets(dataset.datasetId, dataset.nrmId);
  if (error) return <p className="app__create-model-error">{error}</p>;
  if (!sheets) return <p>A carregar…</p>;
  return (
    <SheetViewer
      dataset={sheets}
      activeSheetIndex={activeSheetIndex}
      onActiveSheetIndexChange={onActiveSheetIndexChange}
      columnHighlights={highlights.columns}
      rangeHighlights={highlights.ranges}
      matchedCells={highlights.cells}
    />
  );
}

/** A model being run (not edited): breadcrumb back to the dataset, "Ver dados", and ModelCard itself. */
export function UtilizeScreen({ dataset, utilizeModel, theme, onToggleTheme, onBack, onGoHome }: UtilizeScreenProps) {
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  const [hasOpenedSheetPanel, setHasOpenedSheetPanel] = useState(false);

  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [highlights, setHighlights] = useState<DataHighlights>(NO_HIGHLIGHTS);

  function openSheetPanel() {
    setHasOpenedSheetPanel(true);
    setIsSheetPanelOpen(true);
  }

  // An output's eye: the dataset with whatever that output's chain read marked, on the first sheet
  // it touched — or the plain dataset when it read nothing (or hasn't run yet).
  function viewOutputData(touches: DatasetTouchPayload[] | null) {
    if (touches && touches.length > 0) {
      setHighlights(highlightsFromTouches(touches));
      setActiveSheetIndex(touches[0].sheetIndex);
    } else {
      setHighlights(NO_HIGHLIGHTS);
    }
    openSheetPanel();
  }

  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <div className="app__topbar-actions">
          <button
            type="button"
            className="app__view-data-button"
            onClick={() => {
              setHighlights(NO_HIGHLIGHTS);
              openSheetPanel();
            }}
          >
            <SpreadsheetIcon />
            Ver dados
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <div className="app__utilize-body">
        <ModelCard
          dataset={utilizeModel.datasetId ? { ...dataset, datasetId: utilizeModel.datasetId } : dataset}
          modelName={utilizeModel.modelName}
          modelId={utilizeModel.modelId}
          nrmId={utilizeModel.nrmId}
          inputs={utilizeModel.inputs}
          onViewOutputData={viewOutputData}
        />
      </div>

      <AppFooter onGoHome={onGoHome} />

      <div
        className={isSheetPanelOpen ? 'sheet-panel__backdrop sheet-panel__backdrop--visible' : 'sheet-panel__backdrop'}
        onClick={() => setIsSheetPanelOpen(false)}
        aria-hidden="true"
      />
      <aside className={isSheetPanelOpen ? 'sheet-panel sheet-panel--open' : 'sheet-panel'} aria-hidden={!isSheetPanelOpen}>
        <div className="sheet-panel__header">
          <span className="sheet-panel__title">{dataset.filename}</span>
          <button type="button" className="sheet-panel__close" onClick={() => setIsSheetPanelOpen(false)} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="sheet-panel__body">{hasOpenedSheetPanel && (
            <DataViewer
              dataset={dataset}
              activeSheetIndex={activeSheetIndex}
              onActiveSheetIndexChange={setActiveSheetIndex}
              highlights={highlights}
            />
          )}</div>
      </aside>
    </div>
  );
}
