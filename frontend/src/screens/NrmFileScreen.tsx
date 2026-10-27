import { useState } from 'react';
import { Modal } from '../components/Modal/Modal';
import { BoltIcon, DiskIcon, FolderIcon, PencilIcon } from '../components/ButtonIcons/ButtonIcons';
import { BackButton } from '../components/BackButton/BackButton';
import { AppFooter } from '../components/AppFooter/AppFooter';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle';
import type { Theme } from '../hooks/useTheme';
import type { ImportedModel } from './ChooseModelScreen';

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
  /** Opens the list of saved models — what the save button turns into once the file is saved. */
  onViewModels: () => void;
  /** Rewrites the name inside the file — absent when the session has no .nrm file to rewrite. */
  onRename?: (name: string) => Promise<void>;
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
  onViewModels,
  onRename,
  onBack,
  onGoHome,
}: NrmFileScreenProps) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [isRenameSaving, setIsRenameSaving] = useState(false);
  const currentName = importedModel.nrmName || importedModel.modelName || 'Modelo sem nome';

  function openRename() {
    setDraftName(importedModel.nrmName || importedModel.modelName);
    setIsRenaming(true);
  }

  async function confirmRename() {
    if (!onRename || !draftName.trim() || isRenameSaving) return;
    setIsRenameSaving(true);
    try {
      await onRename(draftName);
      setIsRenaming(false);
    } catch {
      // The API toast already says what went wrong.
    } finally {
      setIsRenameSaving(false);
    }
  }

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
          <p className="app__create-model-eyebrow">Modelo Norma</p>
          <div className="app__nrm-title-row">
            <h1 className="app__create-model-title app__create-model-title--name">{currentName}</h1>
            {onRename && (
              <button type="button" className="app__nrm-rename" onClick={openRename} aria-label="Mudar o nome" title="Mudar o nome">
                <PencilIcon className="app__nrm-rename-icon" />
              </button>
            )}
          </div>
          {importedModel.nrmCreatedAt && (
            <dl className="app__nrm-details">
              <div>
                <dt>Criado em</dt>
                <dd>
                  {new Date(importedModel.nrmCreatedAt).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })}
                </dd>
              </div>
            </dl>
          )}
          {onSaveToLibrary ? (
            <div className="app__create-model-stack">
              <div className="app__create-model-actions">
                <button type="button" className="app__create-model-button action-button app__create-model-button--wide" onClick={onUtilize}>
                  <BoltIcon />
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
                  onClick={saveStatus === 'saved' ? onViewModels : saveToLibrary}
                  disabled={saveStatus === 'saving'}
                >
                  {saveStatus === 'saved' ? <FolderIcon /> : <DiskIcon />}
                  {saveStatus === 'saved' ? 'Ver modelos' : saveStatus === 'saving' ? 'A guardar…' : 'Guardar'}
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
                <BoltIcon />
                Utilizar
              </button>
            </div>
          )}

          {importError && <p className="app__create-model-error">{importError}</p>}
        </div>
      </div>

      {isRenaming && (
        <Modal
          title="Mudar o nome"
          size="sm"
          onClose={() => setIsRenaming(false)}
          closeDisabled={isRenameSaving}
          actions={
            <>
              <button type="button" className="modal__button modal__button--ghost" onClick={() => setIsRenaming(false)} disabled={isRenameSaving}>
                Cancelar
              </button>
              <button type="button" className="modal__button action-button" onClick={confirmRename} disabled={!draftName.trim() || isRenameSaving}>
                {isRenameSaving ? 'A guardar…' : 'Guardar'}
              </button>
            </>
          }
        >
          <p className="modal__hint">O nome é alterado dentro do ficheiro .nrm.</p>
          <label>
            <span className="modal__label">Nome do modelo</span>
            <input
              type="text"
              className="modal__input"
              value={draftName}
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && confirmRename()}
            />
          </label>
        </Modal>
      )}

      <AppFooter onGoHome={onGoHome} />
    </div>
  );
}
