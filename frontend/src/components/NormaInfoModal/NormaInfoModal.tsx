import { Modal } from '../Modal/Modal';
import type { SavedNrmPayload } from '../../types/savedNrm';
import { formatDate, formatSize } from '../../utils/formatNorma';
import './NormaInfoModal.css';

interface NormaInfoModalProps {
  model: SavedNrmPayload;
  onClose: () => void;
}

/**
 * What opens from the "i" of a norma (on its card or on its row of the tree): its name, the description its author wrote,
 * the folder it is filed in, and the rest of what the card says about it — what it is made of, when it was created and last saved, and how big it is.
 */
export function NormaInfoModal({ model, onClose }: NormaInfoModalProps) {
  const description = model.description?.trim() ? model.description : null;
  return (
    <Modal
      title="Informação da norma"
      size="sm"
      onClose={onClose}
      actions={
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <dl className="norma-info">
        <Field label="Nome" value={model.name} />
        {description && <Field label="Descrição" value={description} multiline />}
        <Field label="Pasta" value={model.categoryPath.length > 0 ? model.categoryPath.join(' / ') : 'Sem pasta'} />
        <Field label="Operações" value={String(model.operationCount)} />
        <Field label="Inputs" value={String(model.inputCount)} />
        <Field label="Outputs" value={String(model.outputCount)} />
        <Field label="Criado em" value={formatDate(model.createdAt)} />
        <Field label="Atualizado em" value={formatDate(model.updatedAt)} />
        <Field label="Tamanho" value={formatSize(model.sizeBytes)} />
      </dl>
    </Modal>
  );
}

function Field({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="norma-info__field">
      <dt>{label}:</dt>
      <dd className={multiline ? 'norma-info__description' : undefined}>{value}</dd>
    </div>
  );
}
