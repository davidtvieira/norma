import type { ReactNode } from 'react';
import { Modal } from '../Modal/Modal';
import './ValidationModal.css';

export interface ValidationSet {
  id: string;
  name: string;
  /** The rules in a few words, and how many inputs they apply to. */
  summary: ReactNode;
}

interface ValidationModalProps {
  sets: ValidationSet[];
  /** Whether the canvas is being edited ("Editar"): only then can rule sets be added, changed or removed. */
  canEdit: boolean;
  /** Opens the dialog that chooses which inputs a set applies to. */
  onChooseInputs: (id: string) => void;
  onEditRules: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

/**
 * The model's input validation: its rule sets (what an input has to be: a type, limits, whether it is required) and the
 * inputs each applies to. They are part of the model's settings, not operations, so they are not on the canvas.
 */
export function ValidationModal({ sets, canEdit, onChooseInputs, onEditRules, onRemove, onAdd, onClose }: ValidationModalProps) {
  const editHint = canEdit ? undefined : 'Entre em "Editar" para alterar.';
  return (
    <Modal
      title="Validação das entradas"
      size="md"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="btn btn--primary" onClick={onAdd} disabled={!canEdit} title={editHint}>
            + Novo conjunto de regras
          </button>
        </>
      }
    >
      <p className="modal__hint">
        Regras que as entradas do modelo têm de cumprir. Cada conjunto aplica-se às entradas que escolher.
      </p>
      {sets.length === 0 ? (
        <p className="validation-modal__empty">Ainda não há regras de validação.</p>
      ) : (
        <ul className="validation-modal__list">
          {sets.map((set) => (
            <li key={set.id} className="validation-modal__row">
              <div className="validation-modal__text">
                <span className="validation-modal__name">{set.name || 'Sem nome'}</span>
                <span className="validation-modal__summary">{set.summary}</span>
              </div>
              <div className="validation-modal__actions">
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => onChooseInputs(set.id)}>
                  Entradas
                </button>
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => onEditRules(set.id)} disabled={!canEdit} title={editHint}>
                  Regras
                </button>
                <button type="button" className="btn btn--secondary btn--sm btn--danger-hover" onClick={() => onRemove(set.id)} disabled={!canEdit} title={editHint}>
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
