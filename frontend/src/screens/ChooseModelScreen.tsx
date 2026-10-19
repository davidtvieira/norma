import type { ChangeEvent, RefObject } from 'react';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetImportResponse } from '../types/dataset';
import type { Theme } from '../hooks/useTheme';
import type { SerializableEntry } from '../utils/modelSerialization';

export interface ImportedModel {
  modelName: string;
  /** The .nrm's own name — empty when the model came from a bare .json or an unnamed .nrm. */
  nrmName: string;
  entries: SerializableEntry[];
  inputOperationIds: string[];
  outputOperationIds: string[];
}

interface ChooseModelScreenProps {
  dataset: DatasetImportResponse;
  importedModel: ImportedModel | null;
  importError: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  importFileInputRef: RefObject<HTMLInputElement | null>;
  onCreateFresh: () => void;
  onTriggerImportModel: () => void;
  onImportModelFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onEditImportedModel: () => void;
  onUtilizeImportedModel: () => void;
  onCancelImportedModel: () => void;
  onBackToLanding: () => void;
  onGoHome: () => void;
}

/**
 * Shown right after a dataset is ready: either "Criar Modelo" / "Importar Modelo" for a fresh
 * dataset, or "Editar Modelo" / "Utilizar Modelo" once a model file has been imported for it.
 */
export function ChooseModelScreen({
  dataset,
  importedModel,
  importError,
  theme,
  onToggleTheme,
  importFileInputRef,
  onCreateFresh,
  onTriggerImportModel,
  onImportModelFile,
  onEditImportedModel,
  onUtilizeImportedModel,
  onCancelImportedModel,
  onBackToLanding,
  onGoHome,
}: ChooseModelScreenProps) {
  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <nav className="app__breadcrumbs" aria-label="Breadcrumb">
          <span className="app__breadcrumb-item app__breadcrumb-item--current">{dataset.filename}</span>
        </nav>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
                <button type="button" className="app__create-model-button" onClick={onEditImportedModel}>
                  Editar Modelo
                </button>
                <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onUtilizeImportedModel}>
                  Utilizar Modelo
                </button>
              </>
            ) : (
              <>
                <button type="button" className="app__create-model-button" onClick={onCreateFresh}>
                  Criar Modelo
                </button>
                <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onTriggerImportModel}>
                  Importar Modelo
                </button>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="application/json,.nrm"
                  className="app__import-model-file-input"
                  onChange={onImportModelFile}
                />
              </>
            )}
          </div>

          <button
            type="button"
            className="app__create-model-button app__create-model-button--back"
            onClick={importedModel ? onCancelImportedModel : onBackToLanding}
          >
            {importedModel ? '← Voltar' : '← Importar outro conjunto de dados'}
          </button>

          {importError && <p className="app__create-model-error">{importError}</p>}
        </div>
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
