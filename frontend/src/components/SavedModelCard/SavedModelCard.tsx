import { TrashIcon } from '../ButtonIcons/ButtonIcons';
import { NormaMark } from '../NormaMark/NormaMark';
import type { SavedNrmPayload } from '../../types/savedNrm';
import './SavedModelCard.css';

interface SavedModelCardProps {
  model: SavedNrmPayload;
  isOpening: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * One saved model in the "Os meus modelos" grid: a card with its name, what it is made of and when it was last
 * saved, and the actions on it at the bottom. A model whose file is gone from the backend's storage can only be deleted.
 */
export function SavedModelCard({ model, isOpening, onOpen, onDelete }: SavedModelCardProps) {
  return (
    <div className="saved-model-card">
      <button
        type="button"
        className="saved-model-card__delete"
        onClick={onDelete}
        aria-label={`Apagar ${model.name}`}
        title="Apagar"
      >
        <TrashIcon className="saved-model-card__delete-icon" />
      </button>
      <div className="saved-model-card__top">
        <NormaMark className="saved-model-card__mark" />
        <div className="saved-model-card__text">
          <h3 className="saved-model-card__name" title={model.name}>
            {model.name}
          </h3>
          {model.available ? (
            <ul className="saved-model-card__meta">
              <li>
                {plural(model.operationCount, 'operação', 'operações')} · {plural(model.inputCount, 'input', 'inputs')} ·{' '}
                {plural(model.outputCount, 'output', 'outputs')}
              </li>
              <li>Atualizado em {formatDate(model.updatedAt)}</li>
              <li>{formatSize(model.sizeBytes)}</li>
            </ul>
          ) : (
            <p className="saved-model-card__meta">O ficheiro desta norma já não existe na plataforma.</p>
          )}
        </div>
      </div>
      <div className="saved-model-card__actions">
        {model.available && (
          <button type="button" className="app__create-model-button action-button" onClick={onOpen} disabled={isOpening}>
            Abrir
          </button>
        )}
      </div>
    </div>
  );
}
