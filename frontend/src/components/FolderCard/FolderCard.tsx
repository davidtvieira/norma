import { FolderClosedIcon, FolderOpenIcon, PencilIcon, TrashIcon } from '../ButtonIcons/ButtonIcons';
import type { FolderEntryPayload } from '../../types/savedNrm';
import { useState } from 'react';
import { FOLDER_DRAG_TYPE } from '../../utils/normaDrag';
import { useNormaDropTarget } from '../../hooks/useNormaDropTarget';
import '../NormaCard/NormaCard.css';
import '../NormaCard/NormaCardCategory.css';

interface FolderCardProps {
  category: FolderEntryPayload;
  onOpen: () => void;
  /** A norma card was dropped on this folder: files it here. */
  onDropNorma: (normaId: string) => void;
  /** Another folder card was dropped on this one: moves it inside. */
  onDropFolder: (folderId: string) => void;
  /** The card started (true) or stopped (false) being dragged. */
  onDragChange: (isDragging: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A category as a folder in the grid of "As minhas normas": click (or Enter / Space) to open it, or drop a norma card (or another folder) on it to file it there; it can be dragged too. */
export function FolderCard({ category, onOpen, onDropNorma, onDropFolder, onDragChange, onEdit, onDelete }: FolderCardProps) {
  const drop = useNormaDropTarget(onDropNorma, onDropFolder);
  const [isDragging, setIsDragging] = useState(false);
  return (
    <div
      className={`norma-card norma-card--folder norma-card--openable${drop.isOver ? ' norma-card--drop' : ''}${isDragging ? ' norma-card--dragging' : ''}`}
      {...drop.props}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(FOLDER_DRAG_TYPE, category.id);
        event.dataTransfer.effectAllowed = 'move';
        setIsDragging(true);
        onDragChange(true);
      }}
      onDragEnd={() => {
        setIsDragging(false);
        onDragChange(false);
      }}
      role="button"
      tabIndex={0}
      aria-label={`Abrir a pasta ${category.name}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <button
        type="button"
        className="norma-card__move"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        aria-label={`Editar ${category.name}`}
        title="Editar"
      >
        <PencilIcon className="norma-card__move-icon" />
      </button>
      <button
        type="button"
        className="norma-card__delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Apagar ${category.name}`}
        title="Apagar"
      >
        <TrashIcon className="norma-card__delete-icon" />
      </button>
      {/* The folder shuts at rest and opens when the card is pointed at. */}
      <span className="norma-card__folder" aria-hidden="true">
        <FolderClosedIcon className="norma-card__folder-icon norma-card__folder-icon--closed" />
        <FolderOpenIcon className="norma-card__folder-icon norma-card__folder-icon--open" />
      </span>
      <div className="norma-card__text">
        <h3 className="norma-card__name" title={category.name}>
          {category.name}
        </h3>
        <ul className="norma-card__meta">
          <li>{plural(category.totalCount, 'norma', 'normas')}</li>
          {category.childCount > 0 && <li>{plural(category.childCount, 'pasta', 'pastas')}</li>}
        </ul>
      </div>
    </div>
  );
}
