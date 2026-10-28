import '../CategoryModal/CategoryModal.css';
import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { CategorySelect } from '../CategorySelect/CategorySelect';
import type { CategoryNode } from '../../types/category';
import type { SavedNrmPayload } from '../../types/savedNrm';

interface MoveNormaModalProps {
  model: SavedNrmPayload;
  tree: CategoryNode[];
  /** Resolves when filed (the modal closes); rejects if the backend refused (the toast says why; the modal stays). */
  onMove: (categoryId: string | null) => Promise<void>;
  onClose: () => void;
}

/** "Mover para…": picks the category a saved norma is filed under, or none. */
export function MoveNormaModal({ model, tree, onMove, onClose }: MoveNormaModalProps) {
  const [categoryId, setCategoryId] = useState<string | null>(model.categoryId);
  const [isSaving, setIsSaving] = useState(false);

  async function move() {
    setIsSaving(true);
    try {
      await onMove(categoryId);
      onClose();
    } catch {
      // The API toast already says what went wrong.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title="Mover para…"
      subtitle={model.name}
      closeDisabled={isSaving}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="modal__button modal__button--ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="button" className="modal__button action-button" onClick={move} disabled={isSaving || categoryId === model.categoryId}>
            Mover
          </button>
        </>
      }
    >
      <label className="category-modal__form">
        <span className="modal__label">Pasta</span>
        <CategorySelect tree={tree} noneLabel="Sem pasta" value={categoryId} onChange={setCategoryId} />
      </label>
    </Modal>
  );
}
