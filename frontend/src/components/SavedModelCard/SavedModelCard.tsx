import type { SavedNrmPayload } from '../../types/savedNrm';
import './SavedModelCard.css';

interface SavedModelCardProps {
  model: SavedNrmPayload;
  isOpening: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One saved model in the "Os meus modelos" list: its name, what it is made of and when it was last saved, with
 * the actions on it. A model whose file is gone from the backend's storage can only be deleted.
 */
export function SavedModelCard({ model, isOpening, onOpen, onDownload, onDelete }: SavedModelCardProps) {
  return (
    <div className="saved-model-card">
      <div className="saved-model-card__text">
        <h3 className="saved-model-card__name" title={model.name}>
          {model.name}
        </h3>
        <p className="saved-model-card__meta">
          {model.available ? (
            <>
              {model.datasetFilename} · {plural(model.operationCount, 'operação', 'operações')} · {plural(model.inputCount, 'input', 'inputs')} ·{' '}
              {plural(model.outputCount, 'output', 'outputs')} · {formatSize(model.sizeBytes)} · guardado em{' '}
              {new Date(model.updatedAt).toLocaleDateString('pt-PT')}
            </>
          ) : (
            'O ficheiro deste modelo já não existe na plataforma.'
          )}
        </p>
      </div>
      <div className="saved-model-card__actions">
        {model.available && (
          <>
            <button type="button" className="naked-button" onClick={onDownload}>
              Descarregar
            </button>
            <button type="button" className="action-button saved-model-card__open" onClick={onOpen} disabled={isOpening}>
              Abrir
            </button>
          </>
        )}
        <button type="button" className="naked-button saved-model-card__delete" onClick={onDelete}>
          Apagar
        </button>
      </div>
    </div>
  );
}
