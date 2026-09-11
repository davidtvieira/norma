import { ModelCard } from '../components/ModelCard/ModelCard';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportResponse } from '../types/dataset';
import type { SerializableEntry } from '../utils/modelSerialization';
import type { Theme } from '../hooks/useTheme';

export interface UtilizeModel {
  modelName: string;
  entries: SerializableEntry[];
  inputOperationIds: string[];
  outputOperationIds: string[];
}

interface UtilizeScreenProps {
  dataset: DatasetImportResponse;
  utilizeModel: UtilizeModel;
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
}

/** A model being run (not edited): breadcrumb back to the dataset, and ModelCard itself. */
export function UtilizeScreen({ dataset, utilizeModel, theme, onToggleTheme, onBack }: UtilizeScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <nav className="app__breadcrumbs" aria-label="Breadcrumb">
          <button type="button" className="app__breadcrumb-item" onClick={onBack}>
            {dataset.filename}
          </button>
          <span className="app__breadcrumb-separator">/</span>
          <span className="app__breadcrumb-item app__breadcrumb-item--current">
            {utilizeModel.modelName || 'Modelo sem nome'}
          </span>
        </nav>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__utilize-body">
        <ModelCard
          dataset={dataset}
          modelName={utilizeModel.modelName}
          entries={utilizeModel.entries}
          inputOperationIds={utilizeModel.inputOperationIds}
          outputOperationIds={utilizeModel.outputOperationIds}
          onBack={onBack}
        />
      </div>

      <footer className="app__footer">
        <h1 className="app__brand">Norma</h1>
      </footer>
    </div>
  );
}
