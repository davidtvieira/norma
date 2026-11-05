import { CloseIcon } from '../ButtonIcons/ButtonIcons';
import { useNormaDropTarget } from '../../hooks/useNormaDropTarget';
import './RemoveFromFolderCard.css';

interface RemoveFromFolderCardProps {
  /** A norma card was dropped on it: takes the norma out of its folder. */
  onDropNorma: (normaId: string) => void;
  /** A folder card was dropped on it: takes the folder out of its parent, to the top level. */
  onDropFolder: (folderId: string) => void;
}

/** Takes the place of the "Nova pasta" card, only while a norma or a folder that is in a folder is being dragged: drop it here to take it out of its folder. */
export function RemoveFromFolderCard({ onDropNorma, onDropFolder }: RemoveFromFolderCardProps) {
  const drop = useNormaDropTarget(onDropNorma, onDropFolder);
  return (
    <div className={`remove-from-folder-card${drop.isOver ? ' remove-from-folder-card--over' : ''}`} {...drop.props}>
      <span className="remove-from-folder-card__icon">
        <CloseIcon />
      </span>
      <span className="remove-from-folder-card__label">Remover da pasta</span>
    </div>
  );
}
