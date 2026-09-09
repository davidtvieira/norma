import './AddOperationModal.css';

export interface OperationKindOption {
  id: string;
  label: string;
}

interface AddOperationModalProps {
  open: boolean;
  onClose: () => void;
  kinds: OperationKindOption[];
  onPick: (kindId: string) => void;
}

/**
 * Reachable from the canvas' "+ Adicionar operação" button. Only picks the operation's type
 * (Lookup, Sum, ...) — picking one closes the modal and drops a new draft node on the canvas,
 * configured in place exactly like before (table/column/range pickers on the node itself), so
 * the canvas doesn't need to host that configuration inside the modal too.
 */
export function AddOperationModal({ open, onClose, kinds, onPick }: AddOperationModalProps) {
  if (!open) return null;

  function pick(kindId: string) {
    onPick(kindId);
    onClose();
  }

  return (
    <div className="add-operation-modal__overlay" onClick={onClose}>
      <div
        className="add-operation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-operation-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-operation-modal-title" className="add-operation-modal__title">
          Nova operação
        </h2>
        <p className="add-operation-modal__body">Escolha o tipo de operação a adicionar ao modelo.</p>

        <div className="add-operation-modal__kinds">
          {kinds.map((kind) => (
            <button key={kind.id} type="button" className="add-operation-modal__kind-option" onClick={() => pick(kind.id)}>
              {kind.label}
            </button>
          ))}
        </div>

        <div className="add-operation-modal__actions">
          <button type="button" className="add-operation-modal__close-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
