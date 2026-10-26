import { Modal } from './Modal';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A yes/no question in the app's own style, instead of the browser's confirm box. */
export function ConfirmModal({ title, message, confirmLabel, cancelLabel = 'Cancelar', onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="modal__button modal__button--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="modal__button action-button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal__text">{message}</p>
    </Modal>
  );
}
