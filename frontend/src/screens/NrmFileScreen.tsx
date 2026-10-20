import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { Theme } from '../hooks/useTheme';
import type { DatasetHandle } from '../types/dataset';
import type { ImportedModel } from './ChooseModelScreen';

interface NrmFileScreenProps {
  dataset: DatasetHandle;
  importedModel: ImportedModel;
  importError: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onEdit: () => void;
  onUtilize: () => void;
  onBack: () => void;
  onGoHome: () => void;
}

/**
 * Where a Norma file (.nrm) loaded from the home page lands. It's a mode of its own: the file
 * already holds its dataset and its model, so there's nothing to choose between creating or
 * importing a model, and "Voltar" leaves the file entirely (back to the home page) instead of
 * dropping into the dataset/model options.
 */
export function NrmFileScreen({ dataset, importedModel, importError, theme, onToggleTheme, onEdit, onUtilize, onBack, onGoHome }: NrmFileScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <nav className="app__breadcrumbs" aria-label="Breadcrumb" />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__create-model-body">
        <div className="app__create-model-content">
          <p className="app__create-model-eyebrow">Ficheiro Norma</p>
          <h1 className="app__create-model-title">{importedModel.nrmName || importedModel.modelName || 'Modelo sem nome'}</h1>
          <p className="app__create-model-hint">{dataset.filename}</p>
          <div className="app__create-model-actions">
            <button type="button" className="app__create-model-button" onClick={onEdit}>
              Editar
            </button>
            <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onUtilize}>
              Utilizar
            </button>
          </div>

          <button type="button" className="app__create-model-button app__create-model-button--back" onClick={onBack}>
            ← Carregar outro ficheiro Norma
          </button>

          {importError && <p className="app__create-model-error">{importError}</p>}
        </div>
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
