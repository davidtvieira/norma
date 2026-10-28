import { useState } from 'react';
import { TrashIcon } from '../ButtonIcons/ButtonIcons';
import { NormaMark } from '../NormaMark/NormaMark';
import type { SavedNrmPayload } from '../../types/savedNrm';
import { NORMA_DRAG_TYPE } from '../../utils/normaDrag';
import './NormaCard.css';
import './NormaCardCategory.css';

interface NormaCardProps {
  model: SavedNrmPayload;
  isOpening: boolean;
  onOpen: () => void;
  onDelete: () => void;
  /** Where it is filed ("Fiscal › IVA"), or '' when it is under no category. */
  categoryLabel: string;
  /** The card started (true) or stopped (false) being dragged. */
  onDragChange: (isDragging: boolean) => void;
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
 * One norma in the "As minhas normas" grid: a card with its name, what it is made of and when it was last saved.
 * The whole card opens it (click, Enter or Space); the bin in its corner deletes it. A norma whose file is gone from
 * the backend's storage cannot be opened, only deleted.
 */
export function NormaCard({ model, isOpening, onOpen, onDelete, categoryLabel, onDragChange }: NormaCardProps) {
  const canOpen = model.available && !isOpening;
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={`norma-card${model.available ? ' norma-card--openable' : ''}${isOpening ? ' norma-card--opening' : ''}${isDragging ? ' norma-card--dragging' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(NORMA_DRAG_TYPE, model.id);
        event.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
        onDragChange(true);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragChange(false);
      }}
      role={model.available ? 'button' : undefined}
      tabIndex={model.available ? 0 : undefined}
      aria-busy={isOpening || undefined}
      aria-label={model.available ? `Abrir ${model.name}` : undefined}
      onClick={canOpen ? onOpen : undefined}
      onKeyDown={
        canOpen
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      <button
        type="button"
        className="norma-card__delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Apagar ${model.name}`}
        title="Apagar"
      >
        <TrashIcon className="norma-card__delete-icon" />
      </button>
      <NormaMark className="norma-card__mark" />
      <div className="norma-card__text">
        <h3 className="norma-card__name" title={model.name}>
          {model.name}
        </h3>
        {model.available ? (
          <ul className="norma-card__meta">
            <li>
              {plural(model.operationCount, 'operação', 'operações')} · {plural(model.inputCount, 'input', 'inputs')} ·{' '}
              {plural(model.outputCount, 'output', 'outputs')}
            </li>
            <li>Atualizado em {formatDate(model.updatedAt)}</li>
            <li title={categoryLabel || undefined}>
              {formatSize(model.sizeBytes)}
              {categoryLabel && <span className="norma-card__category"> · {categoryLabel}</span>}
            </li>
          </ul>
        ) : (
          <p className="norma-card__meta">O ficheiro desta norma já não existe na plataforma.</p>
        )}
      </div>
    </div>
  );
}
