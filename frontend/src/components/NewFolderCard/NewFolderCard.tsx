import { PlusIcon } from '../ButtonIcons/ButtonIcons';
import './NewFolderCard.css';

interface NewFolderCardProps {
  /** What the card says ("Nova pasta"). */
  label: string;
  onClick: () => void;
}

/** The dashed "+" card that closes the grid of folders and normas: click it to create a folder right here. */
export function NewFolderCard({ label, onClick }: NewFolderCardProps) {
  return (
    <button type="button" className="new-folder-card" onClick={onClick}>
      <span className="new-folder-card__icon">
        <PlusIcon />
      </span>
      <span className="new-folder-card__label">{label}</span>
    </button>
  );
}
