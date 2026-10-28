import { PencilIcon, TrashIcon } from '../ButtonIcons/ButtonIcons';
import type { FolderEntryPayload } from '../../types/savedNrm';
import { useNormaDropTarget } from '../../hooks/useNormaDropTarget';
import '../NormaCard/NormaCard.css';
import '../NormaCard/NormaCardCategory.css';
import './FolderCard.css';

interface FolderCardProps {
  category: FolderEntryPayload;
  /** Say where the folder is (its path) — for a search across all folders. */
  showPath?: boolean;
  onOpen: () => void;
  /** A norma card was dropped on this folder: files it here. */
  onDropNorma: (normaId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A category as a folder in the grid of "As minhas normas": click (or Enter / Space) to open it, or drop a norma card on it to file the norma there. */
export function FolderCard({ category, showPath = false, onOpen, onDropNorma, onEdit, onDelete }: FolderCardProps) {
  const drop = useNormaDropTarget(onDropNorma);
  return (
    <div
      className={`norma-card norma-card--openable folder-card${drop.isOver ? ' folder-card--drop' : ''}`}
      {...drop.props}
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
      <div className="norma-card__text">
        <h3 className="norma-card__name" title={category.name}>
          {category.name}
        </h3>
        <ul className="norma-card__meta">
          <li>{plural(category.totalCount, 'norma', 'normas')}</li>
          {category.childCount > 0 && <li>{plural(category.childCount, 'pasta', 'pastas')}</li>}
          {showPath && category.path.length > 1 && <li title={category.path.join(' › ')}>{category.path.slice(0, -1).join(' › ')}</li>}
        </ul>
      </div>
    </div>
  );
}
