import { ChevronRightIcon } from '../ButtonIcons/ButtonIcons';
import { Modal } from '../Modal/Modal';
import { KIND_DESCRIPTIONS } from '../OperationPanel/kindLabels';
import './AddOperationModal.css';

export interface OperationKindOption {
  id: string;
  label: string;
}

interface AddOperationModalProps {
  open: boolean;
  onClose: () => void;
  kinds: OperationKindOption[];
  /** Kinds that can't be added right now (e.g. a second iterator) — shown but disabled. */
  disabledKindIds?: string[];
  /** The kind whose new operation is being set up in the panel docked beside this modal, if any. */
  activeKindId?: string | null;
  onPick: (kindId: string) => void;
}

/**
 * Reachable from the canvas' "+ Adicionar operação" button. Only picks the operation's type
 * (Lookup, Sum, ...) — clicking one opens its configuration in the panel docked to the left
 * (see OperationPanel's renderConfigPanel) while this modal stays open behind it; the owner closes
 * it once the operation has been added. Clicking another type meanwhile switches to that one.
 */
export function AddOperationModal({ open, onClose, kinds, disabledKindIds = [], activeKindId = null, onPick }: AddOperationModalProps) {
  if (!open) return null;

  return (
    <Modal
      title="Nova operação"
      size="lg"
      onClose={onClose}
      closeOnBackdrop={activeKindId === null}
      actions={
        <button type="button" className="modal__button modal__button--ghost" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <p className="modal__hint">Escolha o tipo de operação a adicionar ao modelo.</p>

      <div className="add-operation-modal__kinds">
        {kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            className={`add-operation-modal__kind-option${activeKindId === kind.id ? ' add-operation-modal__kind-option--selected' : ''}`}
            aria-pressed={activeKindId === kind.id}
            disabled={disabledKindIds.includes(kind.id)}
            title={disabledKindIds.includes(kind.id) ? 'O modelo já tem uma operação deste tipo.' : undefined}
            onClick={() => onPick(kind.id)}
          >
            <span className="add-operation-modal__kind-text">
              <span className="add-operation-modal__kind-label">{kind.label}</span>
              {KIND_DESCRIPTIONS[kind.id] && (
                <span className="add-operation-modal__kind-description">{KIND_DESCRIPTIONS[kind.id]}</span>
              )}
            </span>
            <ChevronRightIcon className="add-operation-modal__kind-arrow" />
          </button>
        ))}
      </div>
    </Modal>
  );
}
