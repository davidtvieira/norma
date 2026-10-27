import { useState } from 'react';
import { LoadingOverlay } from '../components/LoadingOverlay/LoadingOverlay';
import { LogoIcon, DiskIcon, FolderIcon, PencilIcon } from '../components/ButtonIcons/ButtonIcons';
import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { Theme } from '../hooks/useTheme';
import type { ImportedModel } from './ChooseModelScreen';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });
}

interface NrmFileScreenProps {
  importedModel: ImportedModel;
  importError: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onEdit: () => void;
  onUtilize: () => void;
  /** Keeps the uploaded .nrm in the library — only given when there is an uploaded file to keep (a model opened
   * from the library is already there). */
  onSaveToLibrary?: () => Promise<void>;
  /** Opens the list of normas — what the save button turns into once the file is saved. */
  onViewNormas: () => void;
  onBack: () => void;
  onGoHome: () => void;
}

/**
 * Where a Norma file (.nrm) loaded from the home page lands. It's a mode of its own: the file
 * already holds its dataset and its model, so there's nothing to choose between creating or
 * importing a model, and "Voltar" leaves the file entirely (back to the home page) instead of
 * dropping into the dataset/model options.
 */
export function NrmFileScreen({
  importedModel,
  importError,
  theme,
  onToggleTheme,
  onEdit,
  onUtilize,
  onSaveToLibrary,
  onViewNormas,
  onBack,
  onGoHome,
}: NrmFileScreenProps) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const currentName = importedModel.nrmName || importedModel.modelName || 'Norma sem nome';

  async function saveToLibrary() {
    if (!onSaveToLibrary) return;
    setSaveStatus('saving');
    try {
      await onSaveToLibrary();
      setSaveStatus('saved');
    } catch {
      // The API toast already says what went wrong.
      setSaveStatus('idle');
    }
  }

  return (
    <div className="app app--landing">
      <header className="app__topbar app__topbar--with-title">
        <BackButton onClick={onBack} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <div className="app__create-model-body">
        <div className="app__create-model-content">
          <p className="app__create-model-eyebrow">Norma</p>
          <div className="app__nrm-title-row">
            <h1 className="app__create-model-title app__create-model-title--name">{currentName}</h1>
          </div>
          {(importedModel.nrmCreatedAt || importedModel.nrmUpdatedAt) && (
            <dl className="app__nrm-details">
              {importedModel.nrmCreatedAt && (
                <div>
                  <dt>Criado em</dt>
                  <dd>{formatDateTime(importedModel.nrmCreatedAt)}</dd>
                </div>
              )}
              {importedModel.nrmUpdatedAt && (
                <div>
                  <dt>Atualizado em</dt>
                  <dd>{formatDateTime(importedModel.nrmUpdatedAt)}</dd>
                </div>
              )}
            </dl>
          )}
          {onSaveToLibrary ? (
            <div className="app__create-model-stack">
              <div className="app__create-model-actions">
                <button type="button" className="app__create-model-button action-button app__create-model-button--wide" onClick={onUtilize}>
                  <LogoIcon />
                Utilizar
                </button>
              </div>
              <div className="app__create-model-actions">
                <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onEdit}>
                  <PencilIcon />
                Editar
                </button>
                <button
                  type="button"
                  className="app__create-model-button app__create-model-button--secondary"
                  onClick={saveStatus === 'saved' ? onViewNormas : saveToLibrary}
                  disabled={saveStatus === 'saving'}
                >
                  {saveStatus === 'saved' ? <FolderIcon /> : <DiskIcon />}
                  {saveStatus === 'saved' ? 'Ver normas' : saveStatus === 'saving' ? 'A guardar…' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="app__create-model-actions">
              <button type="button" className="app__create-model-button app__create-model-button--secondary" onClick={onEdit}>
                <PencilIcon />
                Editar
              </button>
              <button type="button" className="app__create-model-button action-button" onClick={onUtilize}>
                <LogoIcon />
                Utilizar
              </button>
            </div>
          )}

          {importError && <p className="app__create-model-error">{importError}</p>}
        </div>
      </div>

      {saveStatus === 'saving' && <LoadingOverlay delayMs={200} />}

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
