import './SaveModal.css';

interface SaveModalProps {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  canExport: boolean;
}

/**
 * Reachable from the "Guardar modelo" button. Saving the model to the backend isn't wired up
 * yet, but exporting it as a JSON file (see utils/modelSerialization.ts) already is — the same
 * file can later be re-imported via "Importar Modelo para este conjunto de dados".
 */
export function SaveModal({ open, onClose, onExport, canExport }: SaveModalProps) {
  if (!open) return null;

  return (
    <div className="save-modal__overlay" onClick={onClose}>
      <div className="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-modal-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="save-modal-title" className="save-modal__title">
          Guardar modelo
        </h2>
        <p className="save-modal__body">
          Ainda não é possível guardar o modelo diretamente na plataforma. Pode, no entanto, exportá-lo como ficheiro JSON e
          voltar a importá-lo mais tarde.
        </p>
        {!canExport && (
          <p className="save-modal__hint">
            Conclua pelo menos uma operação e defina o input e o output do modelo antes de exportar.
          </p>
        )}
        <div className="save-modal__actions">
          <button type="button" className="save-modal__close-button save-modal__close-button--secondary" onClick={onClose}>
            Fechar
          </button>
          <button
            type="button"
            className="save-modal__close-button"
            onClick={() => {
              onExport();
              onClose();
            }}
            disabled={!canExport}
          >
            Exportar modelo (JSON)
          </button>
        </div>
      </div>
    </div>
  );
}
