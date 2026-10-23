import { useState } from 'react';
import { SpreadsheetIcon } from '../components/ButtonIcons/ButtonIcons';
import { SheetViewer } from '../components/SheetViewer/SheetViewer';
import { useDatasetSheets } from '../hooks/useDatasetSheets';
import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ModelCard } from '../components/ModelCard/ModelCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetHandle } from '../types/dataset';
import type { ModelInputFieldPayload } from '../types/modelCalculation';
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
function DataViewer({ dataset }: { dataset: DatasetHandle }) {
  const { dataset: sheets, error } = useDatasetSheets(dataset.datasetId, dataset.nrmId);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  if (error) return <p className="app__create-model-error">{error}</p>;
  if (!sheets) return <p>A carregar…</p>;
  return <SheetViewer dataset={sheets} activeSheetIndex={activeSheetIndex} onActiveSheetIndexChange={setActiveSheetIndex} />;
}

/** A model being run (not edited): breadcrumb back to the dataset, "Ver dados", and ModelCard itself. */
export function UtilizeScreen({ dataset, utilizeModel, theme, onToggleTheme, onBack, onGoHome }: UtilizeScreenProps) {
  const [isSheetPanelOpen, setIsSheetPanelOpen] = useState(false);
  const [hasOpenedSheetPanel, setHasOpenedSheetPanel] = useState(false);

  function openSheetPanel() {
    setHasOpenedSheetPanel(true);
    setIsSheetPanelOpen(true);
  }

  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <div className="app__topbar-actions">
          <button type="button" className="app__view-data-button" onClick={openSheetPanel}>
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
        <div className="sheet-panel__body">{hasOpenedSheetPanel && <DataViewer dataset={dataset} />}</div>
      </aside>
    </div>
  );
}
