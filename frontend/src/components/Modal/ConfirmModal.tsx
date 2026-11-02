import { Modal } from './Modal';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Paints the confirm button red, for something that cannot be undone. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A yes/no question in the app's own style, instead of the browser's confirm box. */
export function ConfirmModal({ title, message, confirmLabel, cancelLabel = 'Cancelar', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal__text">{message}</p>
    </Modal>
  );
}
