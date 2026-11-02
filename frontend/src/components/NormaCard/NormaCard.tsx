import { useState } from 'react';
import { InfoIcon, TrashIcon } from '../ButtonIcons/ButtonIcons';
import { NormaInfoModal } from '../NormaInfoModal/NormaInfoModal';
import { NormaMark } from '../NormaMark/NormaMark';
import type { SavedNrmPayload } from '../../types/savedNrm';
import { NORMA_DRAG_TYPE } from '../../utils/normaDrag';
import { formatDate, truncate } from '../../utils/formatNorma';
import './NormaCard.css';
import './NormaCardCategory.css';

interface NormaCardProps {
  model: SavedNrmPayload;
  isOpening: boolean;
  onOpen: () => void;
  onDelete: () => void;
  /** The card started (true) or stopped (false) being dragged. */
  onDragChange: (isDragging: boolean) => void;
}

/** The longest a description is shown on a card (the whole of it is in the "i" dialog). */
const DESCRIPTION_CAP = 100;

/**
 * One norma in the "As minhas normas" grid: a card with its name, its description (capped) and when it was last saved.
 * The whole card opens it (click, Enter or Space); the bin in its corner deletes it. A norma whose file is gone from
 * the backend's storage cannot be opened, only deleted.
 */
export function NormaCard({ model, isOpening, onOpen, onDelete, onDragChange }: NormaCardProps) {
  const canOpen = model.available && !isOpening;
  const [isDragging, setIsDragging] = useState(false);
  // Everything else about the norma (the whole description, what it is made of, its size) opens in a dialog, from the "i" beside the bin.
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const description = model.description?.trim() ? model.description : null;

  return (
    <>
    <div
      className={`norma-card norma-card--norma norma-card--has-info${model.available ? ' norma-card--openable' : ''}${isOpening ? ' norma-card--opening' : ''}${isDragging ? ' norma-card--dragging' : ''}`}
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
        className="norma-card__info"
        onClick={(event) => {
          event.stopPropagation();
          setIsInfoOpen(true);
        }}
        aria-label={`Informação sobre ${model.name}`}
        title="Informação"
      >
        <InfoIcon className="norma-card__info-icon" />
      </button>
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
        {description && (
          <p className="norma-card__summary" title={description}>
            {truncate(description, DESCRIPTION_CAP)}
          </p>
        )}
        {model.available ? (
          <ul className="norma-card__meta">
            <li>Atualizado em {formatDate(model.updatedAt)}</li>
          </ul>
        ) : (
          <p className="norma-card__meta">O ficheiro desta norma já não existe na plataforma.</p>
        )}
      </div>
    </div>
    {isInfoOpen && <NormaInfoModal model={model} onClose={() => setIsInfoOpen(false)} />}
    </>
  );
}
