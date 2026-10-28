import './CategoryModal.css';
import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { MAX_FOLDER_NAME_LENGTH } from '../../types/category';
import type { FolderEntryPayload } from '../../types/savedNrm';

interface CategoryModalProps {
  /** The folder being renamed; null to create one. */
  editing: FolderEntryPayload | null;
  /** The folder a new one goes in (null = the top level). */
  initialParentId: string | null;
  /** Resolves when saved (the modal closes); rejects if the backend refused (the toast says why; the modal stays). */
  onSubmit: (name: string, parentId: string | null) => Promise<void>;
  onClose: () => void;
}

/** Create or rename a folder: it only asks for the name. A new folder goes in the folder that is open; renaming leaves it where it is. */
export function CategoryModal({ editing, initialParentId, onSubmit, onClose }: CategoryModalProps) {
  const [name, setName] = useState(editing?.name ?? '');
  // Where it is (or goes): never chosen here.
  const parentId = editing ? editing.parentId : initialParentId;
  const [isSaving, setIsSaving] = useState(false);
  const canSubmit = name.trim() !== '' && !isSaving;

  async function submit() {
    if (!canSubmit) return;
    setIsSaving(true);
    try {
      await onSubmit(name.trim(), parentId);
      onClose();
    } catch {
      // The API toast already says what went wrong.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? 'Editar pasta' : 'Nova pasta'}
      closeDisabled={isSaving}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="modal__button modal__button--ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="button" className="modal__button action-button" onClick={submit} disabled={!canSubmit}>
            {editing ? 'Guardar' : 'Criar'}
          </button>
        </>
      }
    >
      <form
        className="category-modal__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          <span className="modal__label">Nome</span>
          <input type="text" className="modal__input" value={name} maxLength={MAX_FOLDER_NAME_LENGTH} autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
      </form>
    </Modal>
  );
}
