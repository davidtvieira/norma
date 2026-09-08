import './SaveModal.css';

interface SaveModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Placeholder for the eventual "save model" flow — no persistence wired up yet, just the
 * dialog shell so the entry point (the button at the end of the operations panel) exists.
 */
export function SaveModal({ open, onClose }: SaveModalProps) {
  if (!open) return null;

  return (
    <div className="save-modal__overlay" onClick={onClose}>
      <div className="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="save-modal-title" className="save-modal__title">
          Guardar modelo
        </h2>
        <p className="save-modal__body">Ainda não é possível guardar o modelo. Esta funcionalidade estará disponível em breve.</p>
        <div className="save-modal__actions">
          <button type="button" className="save-modal__close-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
