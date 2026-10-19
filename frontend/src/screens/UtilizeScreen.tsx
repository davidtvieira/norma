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

/** A model being run (not edited): breadcrumb back to the dataset, and ModelCard itself. */
export function UtilizeScreen({ dataset, utilizeModel, theme, onToggleTheme, onBack, onGoHome }: UtilizeScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <nav className="app__breadcrumbs" aria-label="Breadcrumb">
          {/* A model is always loaded here, so the dataset's filename stays out of the top-left — the
              model's name is the way back instead. */}
          <button type="button" className="app__breadcrumb-item app__breadcrumb-item--current" onClick={onBack}>
            {utilizeModel.modelName || 'Modelo sem nome'}
          </button>
        </nav>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__utilize-body">
        <ModelCard
          dataset={utilizeModel.datasetId ? { ...dataset, datasetId: utilizeModel.datasetId } : dataset}
          modelName={utilizeModel.modelName}
          modelId={utilizeModel.modelId}
          nrmId={utilizeModel.nrmId}
          inputs={utilizeModel.inputs}
          onBack={onBack}
        />
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
