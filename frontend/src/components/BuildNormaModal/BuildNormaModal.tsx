import { Modal } from '../Modal/Modal';
import { DatasetUploader } from '../DatasetUploader/DatasetUploader';
import { NewFileIcon } from '../ButtonIcons/ButtonIcons';
import type { DatasetImportStatus } from '../../types/dataset';
import './BuildNormaModal.css';

interface BuildNormaModalProps {
  onClose: () => void;
  /** A dataset was imported here: the norma starts from it (the create/import-a-model choice follows). */
  onImportSuccess: (dataset: DatasetImportStatus, file: File) => void;
  /** "Sem dataset": the norma starts with nothing loaded (the create/import-a-model choice follows). */
  onStartWithoutDataset: () => void;
}

/**
 * "Construir a minha norma": how the norma starts — from a dataset (imported right here, dropped or picked), or
 * with none, building a model (or importing one) from the operations that don't read data.
 */
export function BuildNormaModal({ onClose, onImportSuccess, onStartWithoutDataset }: BuildNormaModalProps) {
  return (
    <Modal
      title="Construir a minha norma"
      size="lg"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <p className="modal__hint">Como quer começar?</p>

      <div className="build-norma-modal__options">
        <DatasetUploader onImportSuccess={onImportSuccess} />

        <div className="build-norma-modal__or">
          <span>ou</span>
        </div>

        <div
          className="build-norma-modal__option"
          role="button"
          tabIndex={0}
          onClick={onStartWithoutDataset}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onStartWithoutDataset();
            }
          }}
        >
          <div className="build-norma-modal__option-icon" aria-hidden="true">
            <NewFileIcon />
          </div>
          <p className="build-norma-modal__option-title">Sem dataset</p>
          <p className="build-norma-modal__option-hint">
            Crie ou importe um modelo só com operações que não leem dados. Pode anexar um dataset mais tarde, no editor.
          </p>
        </div>
      </div>
    </Modal>
  );
}
