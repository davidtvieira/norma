import './CategoryModal.css';
import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { CategorySelect } from '../CategorySelect/CategorySelect';
import { MAX_FOLDER_DEPTH, subtreeHeight, type CategoryNode } from '../../types/category';

interface CategoryModalProps {
  /** The category being renamed or moved; null to create one. */
  editing: CategoryNode | null;
  /** The top-level category a new one starts under (null = top level). */
  initialParentId: string | null;
  tree: CategoryNode[];
  /** Resolves when saved (the modal closes); rejects if the backend refused (the toast says why; the modal stays). */
  onSubmit: (name: string, parentId: string | null) => Promise<void>;
  onClose: () => void;
}

/** Create or edit a folder. A new one only asks for its name: it goes in the folder that is open. Editing can also move it. */
export function CategoryModal({ editing, initialParentId, tree, onSubmit, onClose }: CategoryModalProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [parentId, setParentId] = useState<string | null>(editing ? editing.parentId : initialParentId);
  const [isSaving, setIsSaving] = useState(false);
  // The deepest folder it can go under: with everything already under it, it must still fit in the allowed depth.
  const maxParentDepth = MAX_FOLDER_DEPTH - (editing ? subtreeHeight(editing) : 1);
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
          <input type="text" className="modal__input" value={name} maxLength={255} autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
        {editing && (
          <label>
            <span className="modal__label">Dentro de</span>
            <CategorySelect tree={tree} maxDepth={maxParentDepth} exclude={editing.id} noneLabel="Sem pasta" value={parentId} onChange={setParentId} />
          </label>
        )}
      </form>
    </Modal>
  );
}
