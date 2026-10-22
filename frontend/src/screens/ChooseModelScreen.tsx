import type { ChangeEvent, RefObject } from 'react';
import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { DatasetHandle } from '../types/dataset';
import type { Theme } from '../hooks/useTheme';
import type { SerializableEntry } from '../utils/modelSerialization';

export interface ImportedModel {
  modelName: string;
  /** The .nrm's own name — empty when the model came from a bare .json or an unnamed .nrm. */
  nrmName: string;
  /** The operations and the designated inputs/outputs — present for a model parsed in the browser
   * (a bare model .json, or one restored from the cache). Absent for a model that arrived with an
   * imported .nrm: that one stays on the backend under `nrmId` and is only fetched if opened for
   * editing. */
  entries?: SerializableEntry[];
  inputOperationIds?: string[];
  outputOperationIds?: string[];
  /** Set only for a model that arrived with an imported .nrm (already registered on the backend
   * under this .nrm id). */
  nrmId?: string;
}

interface ChooseModelScreenProps {
  dataset: DatasetHandle;
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
        <BackButton onClick={importedModel ? onCancelImportedModel : onBackToLanding} />
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
                <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onEditImportedModel}>
                  Editar Modelo
                </button>
                <button type="button" className="app__create-model-button action-button" onClick={onUtilizeImportedModel}>
                  Utilizar Modelo
                </button>
              </>
            ) : (
              <>
                <button type="button" className="app__create-model-button action-button" onClick={onCreateFresh}>
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

          {importError && <p className="app__create-model-error">{importError}</p>}
        </div>
      </div>

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
