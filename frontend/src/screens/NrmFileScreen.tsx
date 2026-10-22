import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { Theme } from '../hooks/useTheme';
import type { ImportedModel } from './ChooseModelScreen';

interface NrmFileScreenProps {
  /** The dataset's own spreadsheet name (not the .nrm's). */
  datasetFileName: string;
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
export function NrmFileScreen({ datasetFileName, importedModel, importError, theme, onToggleTheme, onEdit, onUtilize, onBack, onGoHome }: NrmFileScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__create-model-body">
        <div className="app__create-model-content">
          <p className="app__create-model-eyebrow">Ficheiro Norma</p>
          <h1 className="app__create-model-title">{importedModel.nrmName || importedModel.modelName || 'Modelo sem nome'}</h1>
          <dl className="app__nrm-details">
            <div>
              <dt>Modelo</dt>
              <dd>{importedModel.modelName || 'Modelo sem nome'}</dd>
            </div>
            <div>
              <dt>Conjunto de dados</dt>
              <dd>{datasetFileName}</dd>
            </div>
          </dl>
          <div className="app__create-model-actions">
            <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onEdit}>
              Editar
            </button>
            <button type="button" className="app__create-model-button action-button" onClick={onUtilize}>
              Utilizar
            </button>
          </div>

          {importError && <p className="app__create-model-error">{importError}</p>}
        </div>
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
