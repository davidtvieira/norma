import { ChevronRightIcon } from '../ButtonIcons/ButtonIcons';
import { Modal } from '../Modal/Modal';
import { KIND_DESCRIPTIONS } from '../OperationPanel/kindLabels';
import './AddOperationModal.css';

export interface OperationKindOption {
  id: string;
  label: string;
  /** Whether this kind reads the dataset: those that do carry a "Conjunto de dados" tag, whether or not the norma has one. */
  requiresDataset: boolean;
}

interface AddOperationModalProps {
  open: boolean;
  onClose: () => void;
  kinds: OperationKindOption[];
  /** Kinds that can't be added right now (e.g. a second iterator) — shown but disabled. */
  disabledKindIds?: string[];
  /** Kinds that read the dataset, while the norma has none — shown but disabled, with the reason. */
  needsDatasetKindIds?: string[];
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
export function AddOperationModal({ open, onClose, kinds, disabledKindIds = [], needsDatasetKindIds = [], activeKindId = null, onPick }: AddOperationModalProps) {
  if (!open) return null;

  return (
    <Modal
      title="Nova operação"
      size="lg"
      onClose={onClose}
      closeOnBackdrop={activeKindId === null}
      actions={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
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
            className="add-operation-modal__kind-option"
            aria-pressed={activeKindId === kind.id}
            disabled={disabledKindIds.includes(kind.id) || needsDatasetKindIds.includes(kind.id)}
            title={
              needsDatasetKindIds.includes(kind.id)
                ? 'Precisa de um conjunto de dados: anexe um no editor ("Anexar conjunto de dados").'
                : disabledKindIds.includes(kind.id)
                  ? 'O modelo já tem uma operação deste tipo.'
                  : undefined
            }
            onClick={() => onPick(kind.id)}
          >
            <span className="add-operation-modal__kind-text">
              <span className="add-operation-modal__kind-label">
                <span className="add-operation-modal__kind-name">{kind.label}</span>
                {kind.requiresDataset && <span className="add-operation-modal__kind-tag">Conjunto de dados</span>}
              </span>
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
